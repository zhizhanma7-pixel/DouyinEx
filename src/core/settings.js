const SAFE_MODE_KEY = 'safeMode'

/**
 * @param {import('./types.js').ScriptApi} api
 * @param {(code: import('./types.js').ErrorCode) => void} logError
 */
export function createSettings(api, logError) {
  return {
    readSafeMode() {
      try {
        return api.getValue(SAFE_MODE_KEY, false) !== false
      } catch {
        logError('settings-read')
        return true
      }
    },
    /** @param {boolean} enabled */
    writeSafeMode(enabled) {
      try {
        api.setValue(SAFE_MODE_KEY, enabled)
        return true
      } catch {
        logError('settings-write')
        return false
      }
    },
  }
}
