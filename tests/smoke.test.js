import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { JSDOM } from 'jsdom'
import { buildUserscript } from '../scripts/build.js'
import { startApp } from '../src/core/app.js'
import { watchRoute } from '../src/core/watch-route.js'
import { features } from '../src/features/registry.js'

const fixture = await readFile(new URL('./fixtures/live-room.html', import.meta.url), 'utf8')
const cleanupFixture = await readFile(new URL('./fixtures/room-cleanup.html', import.meta.url), 'utf8')
const playerFixture = await readFile(new URL('./fixtures/player-room.html', import.meta.url), 'utf8')
const roomUrl = 'https://live.douyin.com/1001'

function openRoom(t, html = fixture) {
  const { window: win } = new JSDOM(html, { url: roomUrl, runScripts: 'outside-only' })
  win.onurlchange = null
  t.after(() => win.close())
  return win
}

function fakeScriptApi(values = new Map()) {
  let nextId = 0
  const commands = new Map()
  const api = {
    getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    setValue: (key, value) => values.set(key, value),
    registerMenuCommand(label, run) {
      commands.set(++nextId, { label, run })
      return nextId
    },
    unregisterMenuCommand: (id) => commands.delete(id),
  }
  return { api, commands }
}

function navigate(win, path, event = 'urlchange') {
  win.history.pushState(null, '', path)
  win.dispatchEvent(new win.Event(event))
}

function testFeature(id, kind, mount) {
  return {
    id, label: id, section: 'diagnostics', defaultEnabled: true,
    capabilities: (route) => route.kind === kind ? 'supported' : 'unsupported',
    mount,
  }
}

function panelRoot(win) {
  return win.document.querySelector('douyinex-settings').shadowRoot
}

function control(root, label) {
  return [...root.querySelectorAll('.row label')].find((row) => row.textContent === label)
    .querySelector('input')
}

function mockMedia(video) {
  video.style.visibility = 'visible'
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 })
  Object.defineProperties(video, {
    readyState: { value: 4 },
    paused: { value: false },
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
  })
}

test('room navigation mounts once and removes old resources without altering the player', (t) => {
  const win = openRoom(t)
  const { api, commands } = fakeScriptApi()
  const video = win.document.querySelector('video')
  const original = video.outerHTML
  const events = []
  const stop = startApp(win, api, [
    testFeature('room', 'room', ({ route, signal }) => {
      events.push(`mount ${route.key}`)
      video.addEventListener('play', () => events.push(`play ${route.key}`), { signal })
      return { dispose: () => events.push(`cleanup ${route.key}`) }
    }),
    testFeature('portal', 'portal', () => {
      events.push('mount portal')
      return { dispose: () => events.push('cleanup portal') }
    }),
  ])

  navigate(win, '/1001/?source=portal#chat')
  navigate(win, '/2002')
  video.dispatchEvent(new win.Event('play'))
  navigate(win, '/help')
  navigate(win, '/')
  navigate(win, '/1001', 'popstate')
  stop()
  navigate(win, '/3003')
  video.dispatchEvent(new win.Event('play'))

  assert.deepEqual(events, [
    'mount /1001', 'cleanup /1001', 'mount /2002', 'play /2002', 'cleanup /2002',
    'mount portal', 'cleanup portal', 'mount /1001', 'cleanup /1001',
  ])
  assert.equal(commands.size, 0)
  assert.equal(video.outerHTML, original)
})

test('back-forward cache restores the runtime once and re-reads safe mode', (t) => {
  const win = openRoom(t)
  const values = new Map()
  const { api, commands } = fakeScriptApi(values)
  const calls = []
  startApp(win, api, [
    testFeature('room', 'room', () => {
      calls.push('mount')
      return { dispose: () => calls.push('cleanup') }
    }),
  ])
  const page = (type, persisted) => win.dispatchEvent(new win.PageTransitionEvent(type, { persisted }))

  page('pageshow', false)
  page('pagehide', true)
  assert.equal(commands.size, 0)
  values.set('safeMode', true)
  page('pageshow', true)
  assert.equal(commands.size, 1)
  const [command] = commands.values()
  assert.match(command.label, /关闭安全模式/)
  command.run()
  assert.equal(values.get('safeMode'), false)
  commands.values().next().value.run()
  assert.equal(values.get('safeMode'), true)
  navigate(win, '/2002')
  page('pagehide', false)
  page('pageshow', true)

  assert.deepEqual(calls, ['mount', 'cleanup', 'mount', 'cleanup'])
  assert.equal(commands.size, 0)
})

test('fallback observes silent history changes and clears its timer', (t) => {
  const win = openRoom(t)
  delete win.onurlchange
  let tick
  t.mock.method(win, 'setInterval', (callback, delay) => {
    assert.equal(delay, 500)
    tick = callback
    return 7
  })
  const clearInterval = t.mock.method(win, 'clearInterval', () => {})
  const paths = []
  const stopWatching = watchRoute(win, () => paths.push(win.location.pathname))

  win.history.replaceState(null, '', '/2002')
  tick()
  stopWatching()
  win.dispatchEvent(new win.Event('popstate'))
  assert.deepEqual(paths, ['/2002'])
  assert.deepEqual(clearInterval.mock.calls[0].arguments, [7])
})

test('mount and cleanup failures are isolated and omit raw errors', (t) => {
  const win = openRoom(t)
  const { api } = fakeScriptApi()
  const warn = t.mock.method(console, 'warn', () => {})
  const calls = []
  const stop = startApp(win, api, [
    testFeature('mount-failure', 'room', ({ signal }) => {
      win.addEventListener('probe', () => calls.push('leaked'), { signal })
      throw new Error('sensitive simulated data')
    }),
    testFeature('working', 'room', () => ({ dispose: () => calls.push('cleanup') })),
    testFeature('cleanup-failure', 'room', () => ({
      dispose() { throw new Error('sensitive simulated data') },
    })),
  ])
  win.dispatchEvent(new win.Event('probe'))
  stop()

  assert.deepEqual(calls, ['cleanup'])
  assert.deepEqual(warn.mock.calls.map(({ arguments: args }) => args), [
    ['[DouyinEx]', 'feature-mount'], ['[DouyinEx]', 'feature-cleanup'],
  ])
})

test('storage failures start in safe mode and keep the previous state if a write fails', (t) => {
  const win = openRoom(t)
  const { api, commands } = fakeScriptApi()
  const warn = t.mock.method(console, 'warn', () => {})
  api.getValue = api.setValue = () => { throw new Error('sensitive simulated data') }
  const stop = startApp(win, api, [
    testFeature('room', 'room', () => assert.fail('a room feature mounted in safe mode')),
  ])
  const [command] = commands.values()
  assert.match(command.label, /关闭安全模式/)
  command.run()
  assert.equal(commands.values().next().value, command)
  stop()
  assert.deepEqual(warn.mock.calls.map(({ arguments: args }) => args), [
    ['[DouyinEx]', 'settings-read'], ['[DouyinEx]', 'settings-write'],
  ])
})

test('the production userscript has narrow metadata and runs once in a fixture', async (t) => {
  const win = openRoom(t)
  const info = t.mock.method(win.console, 'info', () => {})
  const values = new Map()
  const { api, commands } = fakeScriptApi(values)
  Object.assign(win, {
    GM_getValue: api.getValue,
    GM_setValue: api.setValue,
    GM_registerMenuCommand: api.registerMenuCommand,
    GM_unregisterMenuCommand: api.unregisterMenuCommand,
  })
  const original = win.document.body.innerHTML
  const { outputFiles: [script] } = await buildUserscript({ write: false })
  assert.match(script.text, /^\/\/ ==UserScript==\n/)
  const matches = [...script.text.matchAll(/^\/\/ @match\s+(\S+)/gm)]
  assert.deepEqual(matches.map(([, match]) => match), ['https://live.douyin.com/*'])
  const grants = [...script.text.matchAll(/^\/\/ @grant\s+(\S+)/gm)]
  assert.deepEqual(grants.map(([, grant]) => grant), [
    'window.onurlchange', 'GM_getValue', 'GM_setValue',
    'GM_registerMenuCommand', 'GM_unregisterMenuCommand',
  ])
  assert.match(script.text, /^\/\/ @noframes$/m)
  assert.doesNotMatch(script.text, /^\/\/ @(?:connect|require|resource)\b|sourceMappingURL=/m)
  win.eval(script.text)
  win.eval(script.text)
  assert.deepEqual(info.mock.calls.map(({ arguments: args }) => Array.from(args)), [
    ['[DouyinEx] 已初始化'],
  ])
  assert.equal(commands.size, 1)
  assert.equal(commands.keys().next().value, 1)
  assert.equal(win.document.querySelectorAll('douyinex-settings').length, 1)
  const [command] = commands.values()
  command.run()
  assert.equal(values.get('safeMode'), true)
  assert.equal(win.document.querySelector('douyinex-settings'), null)
  assert.match(commands.values().next().value.label, /关闭安全模式/)
  win.dispatchEvent(new win.PageTransitionEvent('pagehide'))
  assert.equal(commands.size, 0)
  assert.equal(win.document.body.innerHTML, original)
})

test('the panel persists switches through navigation and reload and disposes diagnostics immediately', async (t) => {
  const win = openRoom(t)
  const { api } = fakeScriptApi()
  const disconnect = t.mock.method(win.MutationObserver.prototype, 'disconnect')
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const compact = control(root, '紧凑面板')
  const diagnostics = control(root, '查看视频元素状态')
  const detail = diagnostics.closest('.row').querySelector('.detail')
  const trigger = root.querySelector('.trigger')
  trigger.click()
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(root.activeElement, root.querySelector('h2'))
  assert.equal(control(root, '播放器快捷控制').checked, false)
  assert.equal(control(root, '截图与录制').disabled, true)
  assert.equal(compact.checked, false)
  assert.equal(diagnostics.checked, false)

  compact.click()
  diagnostics.click()
  assert.equal(root.host.hasAttribute('data-compact'), true)
  assert.equal(detail.textContent, '已检测到视频元素')
  win.document.querySelector('video').remove()
  await Promise.resolve()
  assert.equal(detail.textContent, '当前页面未检测到视频元素')

  navigate(win, '/2002')
  assert.equal(panelRoot(win), root)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(diagnostics.checked, true)
  assert.equal(disconnect.mock.callCount(), 1)
  navigate(win, '/')
  assert.equal(diagnostics.disabled, true)
  assert.equal(detail.hidden, true)
  assert.equal(disconnect.mock.callCount(), 2)
  navigate(win, '/2002')
  assert.equal(detail.hidden, false)
  diagnostics.click()
  assert.equal(disconnect.mock.callCount(), 3)
  assert.equal(detail.hidden, true)
  win.document.querySelector('main').append(win.document.createElement('video'))
  await Promise.resolve()
  assert.equal(detail.textContent, '')
  root.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(root.activeElement, trigger)
  stop()

  const reloaded = openRoom(t)
  const stopReloaded = startApp(reloaded, api, features)
  assert.equal(control(panelRoot(reloaded), '紧凑面板').checked, true)
  assert.equal(control(panelRoot(reloaded), '查看视频元素状态').checked, false)
  stopReloaded()
})

test('export, import and reset apply only validated feature preferences', (t) => {
  const win = openRoom(t)
  const values = new Map()
  const { api } = fakeScriptApi(values)
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  root.querySelector('.trigger').click()
  root.querySelector('details').open = true
  const [exportButton, importButton, resetButton] = root.querySelectorAll('.transfer .actions button')
  const text = root.querySelector('textarea')
  const feedback = root.querySelector('[role="status"]')
  const compact = control(root, '紧凑面板')
  compact.click()
  exportButton.click()
  const exported = text.value
  assert.deepEqual(JSON.parse(exported), {
    version: 1, features: {
      'player-controls': false, 'highest-quality': false, 'volume-wheel': false, 'pause-guard': false,
      'compact-panel': true, 'video-diagnostics': false,
    },
  })

  for (const invalid of [
    'invalid JSON',
    '{"version":2,"features":{}}',
    '{"version":1,"features":{"compact-panel":"true"}}',
    '{"version":1,"features":{"capture":true}}',
    '{"version":1,"features":{"hide-promotions":true}}',
    '{"version":1,"features":{"__proto__":true}}',
    '{"version":1,"features":{},"safeMode":false}',
    ' '.repeat(8193),
  ]) {
    text.value = invalid
    importButton.click()
    assert.match(feedback.textContent, /格式无效/)
    assert.equal(compact.checked, true)
    assert.deepEqual(values.get('featurePreferences'), JSON.parse(exported))
  }

  resetButton.click()
  assert.equal(compact.checked, false)
  assert.equal(root.host.hasAttribute('data-compact'), false)
  text.value = exported
  importButton.click()
  assert.equal(compact.checked, true)
  assert.equal(root.host.hasAttribute('data-compact'), true)
  stop()
})

test('a failed preference write reverts the control and leaves the feature off', (t) => {
  const win = openRoom(t)
  const { api } = fakeScriptApi()
  const stop = startApp(win, api, features)
  const warn = t.mock.method(console, 'warn', () => {})
  api.setValue = () => { throw new Error('simulated storage error') }
  const root = panelRoot(win)
  const compact = control(root, '紧凑面板')
  compact.click()
  assert.equal(compact.checked, false)
  assert.equal(root.host.hasAttribute('data-compact'), false)
  assert.match(root.querySelector('[role="status"]').textContent, /无法保存/)
  assert.equal(warn.mock.calls[0].arguments[1], 'settings-write')
  stop()
})

test('room cleanup tracks supported variants and never hides protected controls', async (t) => {
  const win = openRoom(t, cleanupFixture)
  const { api } = fakeScriptApi()
  const disconnect = t.mock.method(win.MutationObserver.prototype, 'disconnect')
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const doc = win.document
  const $ = (selector) => doc.querySelector(selector)
  const banner = $('[data-e2e="exhibition-banner"]')
  const giftStrip = $('[data-e2e="gifts-container"]')
  const effect = $('#GiftEffectLayout')
  const background = $('.douyin-player-dynamic-background')
  const video = $('video')
  const videoMarkup = video.outerHTML
  const promotionSwitch = control(root, '隐藏展馆推广横幅')
  const giftSwitch = control(root, '隐藏礼物选项栏')
  const overlaySwitch = control(root, '隐藏礼物特效和飘条')
  const simpleSwitch = control(root, '简洁布局')
  const theaterSwitch = control(root, '影院布局')
  const darkSwitch = control(root, '深色布局')
  const restore = [...root.querySelectorAll('button')].find((button) => button.textContent === '恢复原始布局')

  assert.equal(promotionSwitch.checked, false)
  assert.notEqual(win.getComputedStyle(banner).display, 'none')
  promotionSwitch.click()
  giftSwitch.click()
  overlaySwitch.click()
  assert.equal(win.getComputedStyle(banner).display, 'none')
  assert.equal(win.getComputedStyle(giftStrip).display, 'none')
  assert.equal(win.getComputedStyle(effect).visibility, 'hidden')

  const report = doc.createElement('button')
  report.setAttribute('aria-label', '举报')
  banner.append(report)
  await Promise.resolve()
  assert.notEqual(win.getComputedStyle(banner).display, 'none')
  report.remove()
  await Promise.resolve()
  assert.equal(win.getComputedStyle(banner).display, 'none')
  giftStrip.append($('[data-e2e="recharge-btn"]'))
  await Promise.resolve()
  assert.notEqual(win.getComputedStyle(giftStrip).display, 'none')

  simpleSwitch.click()
  theaterSwitch.click()
  darkSwitch.click()
  assert.equal(win.getComputedStyle(background).visibility, 'hidden')
  assert.equal(win.getComputedStyle(background).filter, 'brightness(.18)')
  assert.equal($('#RightBackgroundLayout').getAttribute('data-douyinex-layout-v1'), 'dark-layout')
  assert.equal(video.outerHTML, videoMarkup)
  assert.notEqual(win.getComputedStyle($('[data-e2e="live-followbutton"]')).display, 'none')
  assert.notEqual(win.getComputedStyle($('#chatroom')).display, 'none')

  restore.click()
  assert.equal(doc.querySelector('[data-douyinex-layout-v1]'), null)
  assert.equal(disconnect.mock.callCount(), 1)
  assert.equal([...root.querySelectorAll('input')].some((input) => input.checked), false)
  stop()
})

test('room preferences survive refresh, are isolated across rooms, and stay out of global exports', (t) => {
  const win = openRoom(t, cleanupFixture)
  const values = new Map()
  const { api } = fakeScriptApi(values)
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const promotion = control(root, '隐藏展馆推广横幅')
  const dark = control(root, '深色布局')
  promotion.click()
  control(root, '紧凑面板').click()
  assert.equal(values.has('featurePreferences:room:/1001'), true)
  navigate(win, '/2002')
  win.document.querySelector('[data-e2e="gifts-container"]').remove()
  assert.equal(promotion.checked, false)
  assert.equal(win.document.querySelector('[data-douyinex-layout-v1]'), null)
  dark.click()
  navigate(win, '/')
  assert.equal(dark.disabled, true)
  assert.equal(win.document.querySelector('[data-douyinex-layout-v1]'), null)
  navigate(win, '/1001')
  assert.equal(promotion.checked, true)
  assert.equal(dark.checked, false)
  const exportButton = [...root.querySelectorAll('button')].find((button) => button.textContent === '导出')
  exportButton.click()
  assert.deepEqual(JSON.parse(root.querySelector('textarea').value).features, {
    'player-controls': false, 'highest-quality': false, 'volume-wheel': false, 'pause-guard': false,
    'compact-panel': true, 'video-diagnostics': false,
  })
  const restoreButton = [...root.querySelectorAll('button')].find((button) => button.textContent === '恢复原始布局')
  restoreButton.click()
  assert.equal(promotion.checked, false)
  assert.equal(control(root, '紧凑面板').checked, true)
  stop()

  const refreshed = openRoom(t, cleanupFixture)
  refreshed.history.replaceState(null, '', '/2002')
  const stopRefreshed = startApp(refreshed, api, features)
  const refreshedRoot = panelRoot(refreshed)
  assert.equal(control(refreshedRoot, '深色布局').checked, true)
  assert.equal(control(refreshedRoot, '隐藏展馆推广横幅').checked, false)
  assert.equal(control(refreshedRoot, '紧凑面板').checked, true)
  stopRefreshed()
})

test('development build has an inline source map', async () => {
  const { outputFiles: [script] } = await buildUserscript({ dev: true, write: false })
  assert.match(script.text, /sourceMappingURL=data:application\/json;base64,/)
})

test('quality uses eligible native tiers once per room and lets the viewer override it', async (t) => {
  const win = openRoom(t, playerFixture)
  const { api } = fakeScriptApi()
  const { document } = win
  const video = document.querySelector('video')
  mockMedia(video)
  const current = document.querySelector('[data-e2e="quality"]')
  const menu = document.querySelector('[data-e2e="quality-selector"]')
  const selected = []
  menu.addEventListener('click', (event) => {
    selected.push(event.target.textContent)
    current.textContent = event.target.textContent
  })
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  control(root, '播放器快捷控制').click()
  const select = root.querySelector('select')
  assert.deepEqual([...select.options].map((option) => option.value), ['高清', '标清'])
  assert.equal(select.value, '标清')
  const preferHighest = control(root, '优先最高可用画质')
  current.textContent = '原画'
  preferHighest.click()
  assert.deepEqual(selected, [])
  preferHighest.click()
  current.textContent = '标清'
  preferHighest.click()
  await delay(15)
  assert.deepEqual(selected, ['高清'])
  assert.equal(select.value, '高清')

  select.value = '标清'
  select.dispatchEvent(new win.Event('change'))
  await delay(15)
  assert.deepEqual(selected, ['高清', '标清'])
  assert.equal(select.value, '标清')
  navigate(win, '/2002')
  assert.deepEqual(selected, ['高清', '标清'])
  video.dispatchEvent(new win.Event('loadedmetadata'))
  await delay(15)
  assert.deepEqual(selected, ['高清', '标清', '高清'])

  menu.remove()
  await delay(15)
  assert.equal(root.querySelector('select').disabled, true)
  assert.equal(root.querySelector('select').selectedOptions[0].textContent, '高清')
  stop()
})

test('wheel and pause guard act on the visible player and leave native controls and other scrolling alone', (t) => {
  const win = openRoom(t, playerFixture)
  const { api } = fakeScriptApi()
  const video = win.document.querySelector('video')
  const native = win.document.querySelector('.douyin-player-controls button')
  const chat = win.document.querySelector('#chatroom')
  mockMedia(video)
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const wheelSwitch = control(root, '播放器滚轮音量')
  const pauseSwitch = control(root, '防误暂停')
  wheelSwitch.click()
  pauseSwitch.click()
  video.volume = 0.5
  video.muted = true
  /** @param {Element} element */
  function wheel(element, extra = {}) {
    const event = new win.WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -100, clientX: 20, clientY: 20, ...extra,
    })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }
  for (const target of [chat, native]) assert.equal(wheel(target), false)
  assert.equal(wheel(video, { ctrlKey: true }), false)
  assert.equal(wheel(video, { clientY: 400 }), false)
  assert.equal(video.volume, 0.5)
  assert.equal(wheel(video), true)
  assert.equal(video.volume, 0.55)
  assert.equal(video.muted, true)
  wheelSwitch.click()
  assert.equal(wheel(video), false)
  wheelSwitch.click()
  navigate(win, '/2002')
  assert.equal(wheel(video), true)
  assert.equal(video.volume, 0.6)

  let videoClicks = 0
  let nativeClicks = 0
  video.addEventListener('click', () => { videoClicks += 1 })
  native.addEventListener('click', () => { nativeClicks += 1 })
  const click = (target) => target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  click(video)
  click(native)
  assert.equal(videoClicks, 0)
  assert.equal(nativeClicks, 1)
  pauseSwitch.click()
  click(video)
  assert.equal(videoClicks, 1)
  stop()
  assert.equal(wheel(video), false)
})

test('player controls disable without video and restore owned crop and fullscreen on teardown', async (t) => {
  const win = openRoom(t, playerFixture)
  const { api } = fakeScriptApi()
  const doc = win.document
  const video = doc.querySelector('video')
  const stage = doc.querySelector('.douyin-player')
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const toggle = control(root, '播放器快捷控制')
  toggle.click()
  const [fullscreen, fill] = root.querySelectorAll('.player-actions button')
  assert.equal(fullscreen.disabled, true)
  assert.equal(fill.disabled, true)
  assert.match(fill.closest('.detail').textContent, /没有可用播放器/)

  mockMedia(video)
  video.style.setProperty('object-fit', 'contain')
  let fullscreenElement = null
  Object.defineProperties(doc, {
    fullscreenEnabled: { value: true },
    fullscreenElement: { get: () => fullscreenElement },
  })
  stage.requestFullscreen = async () => { fullscreenElement = stage }
  doc.exitFullscreen = async () => { fullscreenElement = null }
  video.dispatchEvent(new win.Event('loadedmetadata'))
  await delay(15)
  assert.equal(fullscreen.disabled, false)
  fill.click()
  assert.equal(video.style.objectFit, 'cover')
  fullscreen.click()
  await Promise.resolve()
  assert.equal(doc.fullscreenElement, stage)
  toggle.click()
  assert.equal(doc.fullscreenElement, null)
  assert.equal(video.style.objectFit, 'contain')
  stop()
})
