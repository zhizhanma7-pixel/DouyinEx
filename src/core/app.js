import { readRoute } from '../adapters/douyin/route.js'
import { createSafeModeMenu } from '../ui/safe-mode-menu.js'
import { createLifecycle } from './lifecycle.js'
import { logError } from './logger.js'
import { createSettings } from './settings.js'
import { watchRoute } from './watch-route.js'

/**
 * @param {Window & typeof globalThis} win
 * @param {import('./types.js').ScriptApi} api
 * @param {readonly import('./types.js').Feature[]} features
 */
export function startApp(win, api, features) {
  const lifecycle = createLifecycle(win, features, logError)
  const settings = createSettings(api, logError)
  let safeMode = settings.readSafeMode()
  /** @type {(() => void) | undefined} */
  let stopWatching
  const menu = createSafeModeMenu(api, () => safeMode, toggleSafeMode)

  function update() {
    lifecycle.update(readRoute(win.location))
  }

  function pause() {
    stopWatching?.()
    stopWatching = undefined
    lifecycle.clear()
  }

  function startWatching() {
    if (safeMode || stopWatching) return
    stopWatching = watchRoute(win, update)
    update()
  }

  function toggleSafeMode() {
    const next = !safeMode
    if (!settings.writeSafeMode(next)) return false
    safeMode = next
    if (safeMode) pause()
    else startWatching()
    return true
  }

  /** @param {PageTransitionEvent} event */
  function onPageShow(event) {
    if (!event.persisted) return
    safeMode = settings.readSafeMode()
    menu.show()
    startWatching()
  }

  /** @param {PageTransitionEvent} event */
  function onPageHide(event) {
    if (event.persisted) {
      pause()
      menu.remove()
    } else {
      stop()
    }
  }

  function stop() {
    win.removeEventListener('pageshow', onPageShow)
    win.removeEventListener('pagehide', onPageHide)
    pause()
    menu.remove()
  }

  menu.show()
  startWatching()
  win.addEventListener('pageshow', onPageShow)
  win.addEventListener('pagehide', onPageHide)
  return stop
}
