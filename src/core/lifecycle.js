/**
 * @param {Window & typeof globalThis} win
 * @param {readonly import('./types.js').Feature[]} features
 * @param {(code: import('./types.js').ErrorCode) => void} logError
 */
export function createLifecycle(win, features, logError) {
  /** @type {string | null} */
  let routeKey = null
  /** @type {(() => void)[]} */
  let cleanups = []

  function clear() {
    routeKey = null
    const previous = cleanups
    cleanups = []
    for (const cleanup of previous.reverse()) {
      try {
        cleanup()
      } catch {
        logError('feature-cleanup')
      }
    }
  }

  /** @param {import('./types.js').Route | null} route */
  function update(route) {
    const nextKey = route?.key ?? null
    if (nextKey === routeKey) return
    clear()
    if (!route) return
    routeKey = nextKey

    for (const feature of features) {
      if (feature.route !== route.kind) continue
      const scope = new win.AbortController()
      try {
        const cleanup = feature.mount({ document: win.document, route, signal: scope.signal })
        cleanups.push(() => {
          scope.abort()
          cleanup?.()
        })
      } catch {
        scope.abort()
        logError('feature-mount')
      }
    }
  }

  return { clear, update }
}
