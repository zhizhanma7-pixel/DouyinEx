import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { buildUserscript } from '../scripts/build.js'
import { startApp } from '../src/core/app.js'
import { watchRoute } from '../src/core/watch-route.js'
import { features } from '../src/features/registry.js'

const fixture = await readFile(new URL('./fixtures/live-room.html', import.meta.url), 'utf8')
const roomUrl = 'https://live.douyin.com/1001'

function openRoom(t) {
  const { window: win } = new JSDOM(fixture, { url: roomUrl, runScripts: 'outside-only' })
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
  assert.equal(control(root, '播放器快捷控制').disabled, true)
  assert.equal(control(root, '隐藏页面杂项').disabled, true)
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
  const [exportButton, importButton, resetButton] = root.querySelectorAll('.actions button')
  const text = root.querySelector('textarea')
  const feedback = root.querySelector('[role="status"]')
  const compact = control(root, '紧凑面板')
  compact.click()
  exportButton.click()
  const exported = text.value
  assert.deepEqual(JSON.parse(exported), {
    version: 1, features: { 'compact-panel': true, 'video-diagnostics': false },
  })

  for (const invalid of [
    'invalid JSON',
    '{"version":2,"features":{}}',
    '{"version":1,"features":{"compact-panel":"true"}}',
    '{"version":1,"features":{"capture":true}}',
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

test('development build has an inline source map', async () => {
  const { outputFiles: [script] } = await buildUserscript({ dev: true, write: false })
  assert.match(script.text, /sourceMappingURL=data:application\/json;base64,/)
})
