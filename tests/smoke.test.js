import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { buildUserscript } from '../scripts/build.js'
import { startApp } from '../src/core/app.js'
import { watchRoute } from '../src/core/watch-route.js'

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

test('room navigation mounts once and removes old resources without altering the player', (t) => {
  const win = openRoom(t)
  const { api, commands } = fakeScriptApi()
  const video = win.document.querySelector('video')
  const original = video.outerHTML
  const events = []
  const stop = startApp(win, api, [{
    route: 'room',
    mount({ route, signal }) {
      events.push(`mount ${route.key}`)
      video.addEventListener('play', () => events.push(`play ${route.key}`), { signal })
      return () => events.push(`cleanup ${route.key}`)
    },
  }, {
    route: 'portal',
    mount() {
      events.push('mount portal')
      return () => events.push('cleanup portal')
    },
  }])

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
  startApp(win, api, [{
    route: 'room',
    mount() {
      calls.push('mount')
      return () => calls.push('cleanup')
    },
  }])
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
  const stop = startApp(win, api, [{
    route: 'room',
    mount({ signal }) {
      win.addEventListener('probe', () => calls.push('leaked'), { signal })
      throw new Error('sensitive simulated data')
    },
  }, {
    route: 'room',
    mount: () => () => calls.push('cleanup'),
  }, {
    route: 'room',
    mount: () => () => { throw new Error('sensitive simulated data') },
  }])
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
  const stop = startApp(win, api, [{
    route: 'room',
    mount: () => assert.fail('a room feature mounted in safe mode'),
  }])
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
  assert.equal(commands.size, 1)
  assert.equal(commands.keys().next().value, 1)
  const [command] = commands.values()
  command.run()
  assert.equal(values.get('safeMode'), true)
  assert.match(commands.values().next().value.label, /关闭安全模式/)
  win.dispatchEvent(new win.PageTransitionEvent('pagehide'))
  assert.equal(commands.size, 0)
  assert.equal(win.document.body.innerHTML, original)
})

test('development build has an inline source map', async () => {
  const { outputFiles: [script] } = await buildUserscript({ dev: true, write: false })
  assert.match(script.text, /sourceMappingURL=data:application\/json;base64,/)
})
