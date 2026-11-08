const SAFE_MODE_KEY = 'safeMode'
const PREFERENCES_KEY = 'featurePreferences'
const ROOM_INDEX_KEY = `${PREFERENCES_KEY}:rooms`
export const MAX_PREFERENCES_LENGTH = 8192
export const MAX_STORED_ROOMS = 50

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

  /** @param {import('./types.js').Preferences} preferences */
  function isRoomDefault(preferences) {
    return Object.entries(roomDefaults).every(([id, enabled]) => preferences[id] === enabled)
  }

  /** Room keys, most recently used first. @returns {string[]} */
  function readRoomIndex() {
    try {
      const value = api.getValue(ROOM_INDEX_KEY, null)
      if (!Array.isArray(value)) return []
      return [...new Set(value.filter((key) => typeof key === 'string' && /^\/\d{1,20}$/.test(key)))]
    } catch {
      return []
    }
  }

  /** Move a room to the front and drop the least recently used beyond the cap. @param {string} roomKey */
  function rememberRoom(roomKey) {
    const index = readRoomIndex()
    if (index[0] === roomKey && index.length <= MAX_STORED_ROOMS) return
    const next = [roomKey, ...index.filter((key) => key !== roomKey)]
    for (const stale of next.splice(MAX_STORED_ROOMS)) api.deleteValue(storageKey(stale))
    api.setValue(ROOM_INDEX_KEY, next)
  }

  /** @param {string} roomKey */
  function forgetRoom(roomKey) {
    api.deleteValue(storageKey(roomKey))
    const index = readRoomIndex()
    if (index.includes(roomKey)) api.setValue(ROOM_INDEX_KEY, index.filter((key) => key !== roomKey))
  }

  return {
    defaults,
    roomDefaults,
    /** @param {string} id @returns {import('./types.js').FeatureStorage} */
    featureStorage(id) {
      const key = `featureOptions:${id}`
      return {
        read() {
          try {
            const value = api.getValue(key, null)
            return typeof value === 'string' ? value : ''
          } catch {
            logError('settings-read')
            return ''
          }
        },
        write(value) {
          try {
            api.setValue(key, value)
            return true
          } catch {
            logError('settings-write')
            return false
          }
        },
      }
    },
    /**
     * @param {string | null} [roomKey]
     * @param {import('./types.js').Preferences} [fallback]
     */
    readPreferences(roomKey = null, fallback) {
      const known = roomKey ? roomDefaults : defaults
      try {
        const stored = decode(api.getValue(storageKey(roomKey), null), known)
        if (stored && roomKey) {
          try {
            rememberRoom(roomKey)
          } catch {
            // Recency is best effort; the preferences themselves were read.
          }
        }
        return stored ?? known
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
        if (roomKey && isRoomDefault(preferences)) {
          // A room back at defaults needs no storage.
          forgetRoom(roomKey)
          return true
        }
        api.setValue(storageKey(roomKey), { version: 1, features: preferences })
      } catch {
        logError('settings-write')
        return false
      }
      if (roomKey) {
        try {
          rememberRoom(roomKey)
        } catch {
          logError('settings-write')
        }
      }
      return true
    },
    /** Remove every stored room preference. */
    clearRoomPreferences() {
      try {
        for (const key of readRoomIndex()) api.deleteValue(storageKey(key))
        api.deleteValue(ROOM_INDEX_KEY)
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
