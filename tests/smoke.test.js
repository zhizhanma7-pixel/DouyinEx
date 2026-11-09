import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { JSDOM } from 'jsdom'
import { buildUserscript } from '../scripts/build.js'
import { startApp } from '../src/core/app.js'
import { watchRoute } from '../src/core/watch-route.js'
import { features } from '../src/features/registry.js'
import { watchDanmaku } from '../src/adapters/douyin/danmaku.js'

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
    deleteValue: (key) => values.delete(key),
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
    GM_deleteValue: api.deleteValue,
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
    'window.onurlchange', 'GM_getValue', 'GM_setValue', 'GM_deleteValue',
    'GM_registerMenuCommand', 'GM_unregisterMenuCommand',
  ])
  assert.match(script.text, /^\/\/ @noframes$/m)
  assert.doesNotMatch(script.text, /^\/\/ @(?:connect|require|resource|include|updateURL|downloadURL)\b|sourceMappingURL=/m)
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
  assert.equal(control(root, '截图与录制').checked, false)
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
      'picture-in-picture': false, multiview: false,
      capture: false, 'danmaku-export': false,
      'danmaku-filters': false, 'danmaku-stats': false, 'danmaku-plus-one': false, 'danmaku-tail': false,
    'compact-panel': true, 'video-diagnostics': false,
    },
  })

  for (const invalid of [
    'invalid JSON',
    '{"version":2,"features":{}}',
    '{"version":1,"features":{"compact-panel":"true"}}',
    '{"version":1,"features":{"unknown-feature":true}}',
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
    'picture-in-picture': false, multiview: false,
    capture: false, 'danmaku-export': false,
    'danmaku-filters': false, 'danmaku-stats': false, 'danmaku-plus-one': false, 'danmaku-tail': false,
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

test('danmaku normalizes text and emoji, filters recycled rows, and leaves native input events alone', async (t) => {
  const win = openRoom(t, `<div id="chatroom">
    <div class="webcast-chatroom___list">
      <div class="webcast-chatroom___item"><span class="webcast-chatroom___nickname">甲：</span>
        <span class="webcast-chatroom___content-with-emoji-text">你好<img alt="😊"><span hidden>隐藏</span></span></div>
      <div class="webcast-chatroom___item"><span class="webcast-chatroom___nickname">乙：</span>
        <span class="webcast-chatroom___content-with-emoji-text">你好<img alt="😊"></span></div>
      <div class="webcast-chatroom___item">系统通知</div>
    </div><textarea>未发送的草稿</textarea><div contenteditable="true">输入内容</div></div>`)
  const { api } = fakeScriptApi()
  const doc = win.document
  const list = doc.querySelector('.webcast-chatroom___list')
  const [first, second, notice] = list.children
  const scope = new win.AbortController()
  let entries = []
  watchDanmaku(doc, '1001', scope.signal, (snapshot) => { entries = snapshot.entries })
  assert.equal(entries.length, 2)
  assert.deepEqual({ ...entries[0].message, timestamp: 0 }, {
    id: '1', roomId: '1001', author: '甲', text: '你好😊', timestamp: 0, kind: 'text', source: 'visible-dom',
  })
  const original = entries[1].message
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const toggle = control(root, '弹幕过滤')
  toggle.click()
  const marker = 'data-douyinex-danmaku'
  assert.equal(second.getAttribute(marker), 'hidden')
  assert.equal(notice.hasAttribute(marker), false)
  const detail = toggle.closest('.row').querySelector('.detail')
  detail.querySelector('textarea').value = 'Spam'
  detail.querySelector('button').click()
  second.querySelector('.webcast-chatroom___content-with-emoji-text').textContent = 'ＳＰＡＭ'
  await delay(60)
  assert.equal(second.getAttribute(marker), 'hidden')
  assert.notEqual(entries[1].message.id, original.id)
  assert.equal(entries[0].node, first)
  list.scrollTop = 33
  const rows = Array.from({ length: 200 }, () => first.cloneNode(true))
  list.append(...rows)
  await delay(60)
  assert.equal(entries.length, 180)
  assert.equal(list.scrollTop, 33)

  for (const target of doc.querySelectorAll('#chatroom textarea,[contenteditable]')) {
    const event = new win.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
    assert.equal(target.dispatchEvent(event), true)
    assert.equal(target.textContent.length > 0, true)
  }
  toggle.click()
  assert.equal(doc.querySelector(`[${marker}]`), null)
  stop()
  scope.abort()
})

test('PiP is gesture-only and closes the window it opened when disabled', async (t) => {
  const win = openRoom(t, playerFixture)
  const { api } = fakeScriptApi()
  const doc = win.document
  const video = doc.querySelector('video')
  mockMedia(video)
  let active = null
  let supported = false
  Object.defineProperties(doc, {
    pictureInPictureEnabled: { get: () => supported },
    pictureInPictureElement: { get: () => active },
  })
  const enter = t.mock.method(video, 'play', async () => {})
  video.requestPictureInPicture = async () => { active = video }
  doc.exitPictureInPicture = async () => { active = null }
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const toggle = control(root, '画中画')
  toggle.click()
  const button = toggle.closest('.row').querySelector('button')
  assert.equal(button.disabled, true)
  supported = true
  video.dispatchEvent(new win.Event('loadedmetadata'))
  await delay(15)
  assert.equal(button.disabled, false)
  assert.equal(active, null)
  button.click()
  await Promise.resolve()
  assert.equal(active, video)
  toggle.click()
  assert.equal(active, null)
  assert.equal(enter.mock.callCount(), 0)
  stop()
})

test('multiview validates room URLs, caps at two, reorders without moving frames, and tears down', (t) => {
  const win = openRoom(t)
  const { api } = fakeScriptApi()
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const toggle = control(root, '双房间视图')
  toggle.click()
  toggle.closest('.row').querySelector('button').click()
  const board = root.querySelector('.multiview')
  const input = board.querySelector('input')
  const button = (text) => [...board.querySelectorAll('button')].find((node) => node.textContent === text)
  const add = button('添加房间')
  for (const value of ['https://example.com/1001', 'https://x@live.douyin.com/1001']) {
    input.value = value
    add.click()
  }
  assert.equal(board.querySelectorAll('iframe').length, 0)
  input.value = '2001'
  add.click()
  input.value = 'https://live.douyin.com/2001/?ignored=1'
  add.click()
  assert.equal(board.querySelectorAll('iframe').length, 1)
  input.value = 'https://live.douyin.com/2002#ignored'
  add.click()
  const frames = [...board.querySelectorAll('iframe')]
  assert.equal(add.disabled, true)
  assert.deepEqual(frames.map((node) => node.getAttribute('src')), [
    'https://live.douyin.com/2001', 'https://live.douyin.com/2002',
  ])
  button('交换位置').click()
  assert.deepEqual([...board.querySelectorAll('iframe')], frames)
  assert.deepEqual(frames.map((node) => node.closest('article').style.order), ['1', '0'])
  button('关闭房间').click()
  assert.equal(board.querySelectorAll('iframe').length, 1)
  navigate(win, '/2002')
  assert.equal(root.querySelector('.multiview'), null)
  assert.equal(frames[1].isConnected, false)
  stop()
})

test('capture requires consent and reports inaccessible or protected frames', (t) => {
  const win = openRoom(t, playerFixture)
  const { api } = fakeScriptApi()
  const video = win.document.querySelector('video')
  mockMedia(video)
  const stop = startApp(win, api, features)
  const toggle = control(panelRoot(win), '截图与录制')
  toggle.click()
  const detail = toggle.closest('.row').querySelector('.detail')
  const consent = detail.querySelector('input')
  const [frame, record] = detail.querySelectorAll('button')
  assert.equal(frame.disabled, true)
  assert.equal(record.disabled, true)
  consent.click()
  assert.equal(frame.disabled, false)
  const draw = t.mock.method(win.HTMLCanvasElement.prototype, 'getContext', () => ({
    drawImage() {},
  }))
  t.mock.method(win.HTMLCanvasElement.prototype, 'toBlob', () => {
    throw new win.DOMException('origin', 'SecurityError')
  })
  frame.click()
  assert.equal(draw.mock.callCount(), 1)
  assert.match(detail.querySelector('[role="status"]').textContent, /跨域/)
  assert.equal(detail.querySelector('a').hidden, true)
  video.dispatchEvent(new win.Event('encrypted'))
  assert.equal(frame.disabled, true)
  assert.match(detail.querySelector('[role="status"]').textContent, /受保护/)
  stop()
})

test('recording teardown never stops a shared source video track', (t) => {
  const win = openRoom(t, playerFixture)
  const { api } = fakeScriptApi()
  const video = win.document.querySelector('video')
  mockMedia(video)
  const base = { id: 'source-id', kind: 'video', readyState: 'live' }
  const source = { ...base, stop: t.mock.fn() }
  const clone = { ...base, id: 'copy-id', stop: t.mock.fn() }
  const captured = { ...base, stop: t.mock.fn(), clone: t.mock.fn(() => clone) }
  win.MediaStream = class {
    constructor(tracks) { this.tracks = tracks }
    getTracks() { return this.tracks }
    getVideoTracks() { return this.tracks }
  }
  win.MediaRecorder = class extends win.EventTarget {
    static isTypeSupported() { return true }
    state = 'inactive'
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive' }
  }
  video.srcObject = new win.MediaStream([source])
  video.captureStream = () => new win.MediaStream([captured])
  t.mock.method(win.HTMLCanvasElement.prototype, 'getContext', () => ({
    drawImage() {},
    getImageData() {},
  }))

  const stop = startApp(win, api, features)
  const toggle = control(panelRoot(win), '截图与录制')
  toggle.click()
  const detail = toggle.closest('.row').querySelector('.detail')
  detail.querySelector('input').click()
  const record = [...detail.querySelectorAll('button')].find((node) => node.textContent.includes('录制'))
  record.click()
  assert.equal(captured.clone.mock.callCount(), 1)
  toggle.click()
  assert.equal(source.stop.mock.callCount(), 0)
  assert.equal(captured.stop.mock.callCount(), 0)
  assert.equal(clone.stop.mock.callCount(), 1)
  stop()
})

test('danmaku export is local, timestamped, and resets on room navigation', async (t) => {
  const win = openRoom(t, `<div id="chatroom"><div class="webcast-chatroom___list">
    <div class="webcast-chatroom___item"><span class="webcast-chatroom___nickname">不要导出昵称</span>
    <span class="webcast-chatroom___content-with-emoji-text">可见文本<img alt="😊"></span></div>
    </div></div>`)
  const { api } = fakeScriptApi()
  let contents
  win.URL.createObjectURL = (blob) => {
    contents = blob.text()
    return 'blob:https://live.douyin.com/local-test'
  }
  let revoked = 0
  win.URL.revokeObjectURL = () => { revoked += 1 }
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const toggle = control(root, '观察与导出弹幕')
  toggle.click()
  const detail = toggle.closest('.row').querySelector('.detail')
  const button = detail.querySelector('button')
  assert.equal(button.disabled, false)
  button.click()
  assert.match(detail.querySelector('a').download, /^douyinex-danmaku-.*\.txt$/)
  assert.match(await contents, /^\d{4}-\d\d-\d\dT[^\t]+\t可见文本😊\n$/)
  navigate(win, '/2002')
  assert.equal(revoked, 1)
  assert.equal(detail.querySelector('a').hidden, true)
  assert.equal(detail.querySelector('button').disabled, true)
  stop()
})

test('danmaku stats count new observations, estimate rate, and reset on room navigation', async (t) => {
  const win = openRoom(t, `<div id="chatroom"><div class="webcast-chatroom___list">
    <div class="webcast-chatroom___item"><span class="webcast-chatroom___nickname">甲</span>
    <span class="webcast-chatroom___content-with-emoji-text">弹幕</span></div></div></div>`)
  const { api } = fakeScriptApi()
  let now = 0
  t.mock.method(win.performance, 'now', () => now)
  const stop = startApp(win, api, features)
  const toggle = control(panelRoot(win), '弹幕统计')
  const detail = toggle.closest('.row').querySelector('.detail')
  toggle.click()
  assert.match(detail.textContent, /新识别文本 0 条/)
  const list = win.document.querySelector('.webcast-chatroom___list')
  const row = list.firstElementChild.cloneNode(true)
  now = 12000
  list.append(row)
  await delay(60)
  assert.match(detail.textContent, /观测 12 秒 · 新识别文本 1 条 · 约 5 条\/分钟/)
  row.append(win.document.createElement('span'))
  await delay(60)
  assert.match(detail.textContent, /新识别文本 1 条/)
  navigate(win, '/2002')
  assert.match(detail.textContent, /观测 0 秒 · 新识别文本 0 条/)
  toggle.click()
  assert.equal(detail.hidden, true)
  stop()
})

const chatRoom = `<div id="chatroom"><div class="webcast-chatroom___list">
  <div class="webcast-chatroom___item"><span class="webcast-chatroom___nickname">甲：</span>
  <span class="webcast-chatroom___content-with-emoji-text">主播好<img alt="😊"></span></div>
  </div><div class="composer"><textarea maxlength="50"></textarea><div><button type="button">发送</button></div></div></div>`

function enter(win, target, init = {}) {
  target.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }))
}

test('danmaku tail is added once on Enter or the send button and respects IME, Shift and bypass', (t) => {
  const win = openRoom(t, chatRoom)
  const { api } = fakeScriptApi()
  const stop = startApp(win, api, features)
  const toggle = control(panelRoot(win), '弹幕小尾巴')
  toggle.click()
  const detail = toggle.closest('.row').querySelector('.detail')
  const editor = win.document.querySelector('#chatroom textarea')
  const inputs = []
  editor.addEventListener('input', () => inputs.push(editor.value))
  editor.value = '没有设置时不变'
  enter(win, editor)
  assert.equal(editor.value, '没有设置时不变')

  detail.querySelector('input[type="text"]').value = '【DouyinEx】'
  detail.querySelector('button').click()
  assert.match(detail.textContent, /今天主播打得不错【DouyinEx】/)
  editor.value = '今天主播打得不错'
  enter(win, editor, { isComposing: true })
  enter(win, editor, { shiftKey: true })
  assert.equal(editor.value, '今天主播打得不错')
  enter(win, editor)
  enter(win, editor)
  assert.equal(editor.value, '今天主播打得不错【DouyinEx】')
  assert.deepEqual(inputs, ['今天主播打得不错【DouyinEx】'])

  editor.value = '   '
  enter(win, editor)
  assert.equal(editor.value, '   ')
  editor.value = '按钮发送'
  win.document.querySelector('#chatroom button').click()
  assert.equal(editor.value, '按钮发送【DouyinEx】')

  const select = detail.querySelector('select')
  select.value = 'prefix'
  detail.querySelector('button').click()
  editor.value = '前缀'
  enter(win, editor)
  assert.equal(editor.value, '【DouyinEx】前缀')

  detail.querySelector('input[type="checkbox"]').click()
  editor.value = '暂停时不加'
  enter(win, editor)
  assert.equal(editor.value, '暂停时不加')
  detail.querySelector('input[type="checkbox"]').click()

  editor.value = '长'.repeat(45)
  enter(win, editor)
  assert.equal(editor.value, '长'.repeat(45))
  assert.match(detail.textContent, /超出字数限制/)

  toggle.click()
  editor.value = '关闭后不变'
  enter(win, editor)
  assert.equal(editor.value, '关闭后不变')
  stop()
})

test('danmaku +1 drafts the body once, previews the tail, and can restore the old draft', async (t) => {
  const win = openRoom(t, chatRoom)
  const { api } = fakeScriptApi(new Map([
    ['featureOptions:danmaku-tail', JSON.stringify({ mode: 'suffix', content: '～' })],
  ]))
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  control(root, '弹幕小尾巴').click()
  const toggle = control(root, '弹幕 +1')
  toggle.click()
  const detail = toggle.closest('.row').querySelector('.detail')
  const doc = win.document
  const editor = doc.querySelector('#chatroom textarea')
  editor.value = '我自己的草稿'
  const host = doc.querySelector('douyinex-plus-one')
  assert.equal(host.hidden, true)
  const body = doc.querySelector('.webcast-chatroom___content-with-emoji-text')
  body.dispatchEvent(new win.MouseEvent('pointerover', { bubbles: true }))
  assert.equal(host.hidden, false)
  const plusOne = host.shadowRoot.querySelector('button')
  assert.equal(plusOne.title, '主播好😊～')
  plusOne.click()
  assert.equal(editor.value, '主播好😊')
  assert.match(detail.textContent, /已放入输入框.*主播好😊～/)
  assert.doesNotMatch(editor.value, /甲/)

  enter(win, editor)
  assert.equal(editor.value, '主播好😊～')

  const restore = [...detail.querySelectorAll('button')].find((button) => button.textContent === '恢复原草稿')
  assert.equal(restore.hidden, false)
  restore.click()
  assert.equal(editor.value, '我自己的草稿')

  body.dispatchEvent(new win.MouseEvent('pointerover', { bubbles: true }))
  t.mock.method(win.performance, 'now', () => 1e9)
  plusOne.click()
  assert.match(detail.textContent, /已经 \+1 过/)
  assert.equal(editor.value, '我自己的草稿')

  doc.querySelector('.webcast-chatroom___list').append(doc.querySelector('.webcast-chatroom___item').cloneNode(true))
  await delay(60)
  doc.body.dispatchEvent(new win.MouseEvent('pointerover', { bubbles: true }))
  assert.equal(host.hidden, true)

  toggle.click()
  assert.equal(doc.querySelector('douyinex-plus-one'), null)
  stop()
})

test('room preferences keep only recent rooms, drop defaults, and can all be cleared', (t) => {
  const win = openRoom(t, cleanupFixture)
  const values = new Map()
  const { api } = fakeScriptApi(values)
  const stop = startApp(win, api, features)
  const root = panelRoot(win)
  const roomKeys = () => [...values.keys()].filter((key) => key.startsWith('featurePreferences:room:'))
  for (let room = 1; room <= 52; room += 1) {
    navigate(win, `/${room}`)
    control(root, '深色布局').click()
  }
  assert.equal(roomKeys().length, 50)
  assert.equal(values.has('featurePreferences:room:/1'), false)
  assert.equal(values.has('featurePreferences:room:/2'), false)
  assert.equal(values.get('featurePreferences:rooms')[0], '/52')

  navigate(win, '/3')
  assert.equal(control(root, '深色布局').checked, true)
  assert.equal(values.get('featurePreferences:rooms')[0], '/3')
  control(root, '深色布局').click()
  assert.equal(values.has('featurePreferences:room:/3'), false)
  assert.equal(values.get('featurePreferences:rooms').includes('/3'), false)

  navigate(win, '/52')
  const clear = [...root.querySelectorAll('button')].find((button) => button.textContent === '清除所有房间设置')
  clear.click()
  assert.deepEqual(roomKeys(), [])
  assert.equal(values.has('featurePreferences:rooms'), false)
  assert.equal(control(root, '深色布局').checked, false)
  stop()
})
