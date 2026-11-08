import { readRoute } from '../adapters/douyin/route.js'
import { watchSettingsDock } from '../adapters/douyin/settings-dock.js'
import { createSafeModeMenu } from '../ui/safe-mode-menu.js'
import { createSettingsPanel } from '../ui/settings-panel.js'
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
  const settings = createSettings(api, logError, features)
  let safeMode = settings.readSafeMode()
  let preferences = settings.defaults
  let roomPreferences = settings.roomDefaults
  /** @type {import('./types.js').Route | null} */
  let route = null
  /** @type {ReturnType<typeof createSettingsPanel> | undefined} */
  let panel
  /** @type {ReturnType<typeof watchSettingsDock> | undefined} */
  let dock
  /** @type {(() => void) | undefined} */
  let stopWatching
  const menu = createSafeModeMenu(api, () => safeMode, toggleSafeMode)

  function applyPreferences() {
    if (!route || !panel) return
    const effective = { ...preferences, ...roomPreferences }
    panel.update(lifecycle.update(route, effective, panel.getView), route.kind === 'room')
  }

  /** @param {import('./types.js').Preferences} next */
  function savePreferences(next) {
    if (!settings.writePreferences(next)) return false
    preferences = next
    applyPreferences()
    return true
  }

  /** @param {import('./types.js').Preferences} next */
  function saveRoomPreferences(next) {
    if (route?.kind !== 'room' || !settings.writePreferences(next, route.key)) return false
    roomPreferences = next
    applyPreferences()
    return true
  }

  function clearPage() {
    lifecycle.clear()
    dock?.remove()
    dock = undefined
    panel?.remove()
    panel = undefined
    route = null
  }

  function update() {
    const nextRoute = readRoute(win.location)
    if (nextRoute?.key === route?.key) return
    if (!nextRoute) {
      clearPage()
      return
    }
    route = nextRoute
    roomPreferences = route.kind === 'room'
      ? settings.readPreferences(route.key)
      : settings.roomDefaults
    panel ??= createSettingsPanel(win.document, features, {
      setFeature(id, enabled) {
        if (Object.hasOwn(settings.roomDefaults, id)) {
          update()
          if (route?.kind !== 'room') return false
          return saveRoomPreferences({ ...settings.readPreferences(route.key, roomPreferences), [id]: enabled })
        }
        if (!Object.hasOwn(settings.defaults, id)) return false
        return savePreferences({ ...settings.readPreferences(null, preferences), [id]: enabled })
      },
      exportPreferences: () => settings.exportPreferences(preferences),
      importPreferences(text) {
        const next = settings.importPreferences(text)
        if (!next) return '偏好格式无效，请使用 DouyinEx 导出的 JSON。'
        return savePreferences(next) ? '已导入并应用设置。' : '无法保存设置，请重试。'
      },
      resetPreferences: () => savePreferences(settings.defaults),
      restoreRoomLayout() {
        update()
        return saveRoomPreferences(settings.roomDefaults)
      },
    })
    dock ??= watchSettingsDock(win, panel.host)
    dock.update(nextRoute)
    applyPreferences()
  }

  function pause() {
    stopWatching?.()
    stopWatching = undefined
    clearPage()
  }

  function startWatching() {
    if (safeMode || stopWatching) return
    preferences = settings.readPreferences()
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
