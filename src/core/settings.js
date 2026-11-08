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
  const defaults = defaultPreferences(false)
  const roomDefaults = defaultPreferences(true)

  /** @param {boolean} room @returns {import('./types.js').Preferences} */
  function defaultPreferences(room) {
    return Object.fromEntries(features
      .filter((feature) => feature.mount && (feature.scope === 'room') === room)
      .map(({ id, defaultEnabled }) => [id, defaultEnabled]))
  }

  /** @param {string | null} roomKey */
  function storageKey(roomKey) {
    return roomKey ? `${PREFERENCES_KEY}:room:${roomKey}` : PREFERENCES_KEY
  }

  /** @param {unknown} value @param {import('./types.js').Preferences} known */
  function decode(value, known) {
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.features)) return null
    if (Object.keys(value).some((key) => key !== 'version' && key !== 'features')) return null
    const preferences = { ...known }
    for (const [id, enabled] of Object.entries(value.features)) {
      if (!Object.hasOwn(known, id) || typeof enabled !== 'boolean') return null
      preferences[id] = enabled
    }
    return preferences
  }

  return {
    defaults,
    roomDefaults,
    /**
     * @param {string | null} [roomKey]
     * @param {import('./types.js').Preferences} [fallback]
     */
    readPreferences(roomKey = null, fallback) {
      const known = roomKey ? roomDefaults : defaults
      try {
        return decode(api.getValue(storageKey(roomKey), null), known) ?? known
      } catch {
        logError('settings-read')
        return fallback ?? known
      }
    },
    /**
     * @param {import('./types.js').Preferences} preferences
     * @param {string | null} [roomKey]
     */
    writePreferences(preferences, roomKey = null) {
      try {
        api.setValue(storageKey(roomKey), { version: 1, features: preferences })
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
        return decode(JSON.parse(text), defaults)
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
