const SAFE_MODE_KEY = 'safeMode'
const PREFERENCES_KEY = 'featurePreferences'
export const MAX_PREFERENCES_LENGTH = 8192

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {import('./types.js').ScriptApi} api
 * @param {(code: import('./types.js').ErrorCode) => void} logError
 * @param {readonly import('./types.js').Feature[]} features
 */
export function createSettings(api, logError, features) {
  /** @type {import('./types.js').Preferences} */
  const defaults = Object.fromEntries(
    features.filter((feature) => feature.mount).map(({ id, defaultEnabled }) => [id, defaultEnabled]),
  )

  /** @param {unknown} value */
  function decode(value) {
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.features)) return null
    if (Object.keys(value).some((key) => key !== 'version' && key !== 'features')) return null
    const preferences = { ...defaults }
    for (const [id, enabled] of Object.entries(value.features)) {
      if (!Object.hasOwn(defaults, id) || typeof enabled !== 'boolean') return null
      preferences[id] = enabled
    }
    return preferences
  }

  return {
    defaults,
    /** @param {import('./types.js').Preferences} [fallback] */
    readPreferences(fallback = defaults) {
      try {
        return decode(api.getValue(PREFERENCES_KEY, null)) ?? defaults
      } catch {
        logError('settings-read')
        return fallback
      }
    },
    /** @param {import('./types.js').Preferences} preferences */
    writePreferences(preferences) {
      try {
        api.setValue(PREFERENCES_KEY, { version: 1, features: preferences })
        return true
      } catch {
        logError('settings-write')
        return false
      }
    },
    /** @param {import('./types.js').Preferences} preferences */
    exportPreferences(preferences) {
      return JSON.stringify({ version: 1, features: preferences }, null, 2)
    },
    /** @param {string} text */
    importPreferences(text) {
      if (text.length > MAX_PREFERENCES_LENGTH) return null
      try {
        return decode(JSON.parse(text))
      } catch {
        return null
      }
    },
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
