/**
 * @param {Window & typeof globalThis} win
 * @param {readonly import('./types.js').Feature[]} features
 * @param {(code: import('./types.js').ErrorCode) => void} logError
 */
export function createLifecycle(win, features, logError) {
  /** @type {string | null} */
  let routeKey = null
  /** @type {Map<string, () => void>} */
  const cleanups = new Map()
  const failed = new Set()

  /** @param {string} id */
  function unmount(id) {
    const cleanup = cleanups.get(id)
    cleanups.delete(id)
    failed.delete(id)
    try {
      cleanup?.()
    } catch {
      logError('feature-cleanup')
    }
  }

  function clear() {
    routeKey = null
    for (const id of [...cleanups.keys()].reverse()) unmount(id)
    failed.clear()
  }

  /**
   * @param {import('./types.js').Route} route
   * @param {import('./types.js').Preferences} preferences
   * @param {(id: string) => { host: HTMLElement; detail: HTMLElement }} getView
   */
  function update(route, preferences, getView) {
    if (route.key !== routeKey) {
      clear()
      routeKey = route.key
    }

    /** @type {Map<string, import('./types.js').FeatureState>} */
    const states = new Map()
    for (const feature of features) {
      const { id, mount } = feature
      const availability = feature.capabilities(route)
      const enabled = preferences[id] === true
      if (availability !== 'supported' || !enabled) unmount(id)
      else if (mount && !cleanups.has(id) && !failed.has(id)) mountFeature(id, mount)
      states.set(id, { availability, enabled, failed: failed.has(id) })
    }
    return states

    /**
     * @param {string} id
     * @param {NonNullable<import('./types.js').Feature['mount']>} mount
     */
    function mountFeature(id, mount) {
      const scope = new win.AbortController()
      try {
        const view = getView(id)
        const lifetime = mount({ document: win.document, route, signal: scope.signal, view })
        cleanups.set(id, () => {
          scope.abort()
          lifetime?.dispose()
        })
      } catch {
        scope.abort()
        failed.add(id)
        logError('feature-mount')
      }
    }
  }

  return { clear, update }
}
