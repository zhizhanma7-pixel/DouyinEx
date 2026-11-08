// The scoped layout and stage were observed in public desktop live rooms.
const stageSelector = '[data-e2e="living-container"] #PlayerLayout .douyin-player'
const qualitySelector = '[data-e2e="quality"],[data-e2e="quality-selector"]'
const playerNodes = `video,.douyin-player,#PlayerLayout,${qualitySelector}`
const mediaEvents = ['loadedmetadata', 'emptied', 'play', 'playing', 'pause', 'waiting', 'stalled',
  'canplay', 'ended', 'error', 'resize', 'volumechange']

/** @typedef {{stage: HTMLElement; video: HTMLVideoElement}} Player */

/** @param {Document} document @returns {Player | null} */
export function findActivePlayer(document) {
  const win = document.defaultView
  if (!win) return null
  let best = null
  let bestArea = 0
  for (const stage of document.querySelectorAll(stageSelector)) {
    if (!(stage instanceof win.HTMLElement)) continue
    for (const video of stage.querySelectorAll('video')) {
      if (video.closest('.douyin-player') !== stage || video.closest('[hidden],[aria-hidden="true"]')) continue
      const rect = video.getBoundingClientRect()
      const area = rect.width * rect.height
      if (area <= 0 || area < bestArea) continue
      const style = win.getComputedStyle(video)
      if (style.visibility !== 'visible' || style.display === 'none' || style.opacity === '0') continue
      if (area === bestArea && best && (!best.video.paused || video.paused)) continue
      best = { stage, video }
      bestArea = area
    }
  }
  return best
}

/** @param {Player | null} player */
export function hasVideoFrames(player) {
  return Boolean(player && player.video.readyState >= 1 && player.video.videoWidth > 0 && !player.video.error)
}

/** @type {WeakMap<Document, ReturnType<typeof createPlayerWatcher>>} */
const watchers = new WeakMap()

/**
 * @param {Document} document
 * @param {AbortSignal} signal
 * @param {(player: Player | null) => void} onChange
 */
export function watchPlayer(document, signal, onChange) {
  let watcher = watchers.get(document)
  if (!watcher) {
    watcher = createPlayerWatcher(document)
    watchers.set(document, watcher)
  }
  watcher.subscribe(signal, onChange)
}

/** @param {Document} document */
function createPlayerWatcher(document) {
  const win = document.defaultView
  if (!win) throw new Error('Player watcher requires a window')
  const browser = win
  /** @type {Set<(player: Player | null) => void>} */
  const subscribers = new Set()
  /** @type {number | undefined} */
  let updateId
  let current = findActivePlayer(document)

  function schedule() {
    if (updateId !== undefined) return
    updateId = browser.setTimeout(() => {
      updateId = undefined
      current = findActivePlayer(document)
      for (const subscriber of subscribers) subscriber(current)
    })
  }

  const observer = new win.MutationObserver((records) => {
    for (const record of records) {
      const target = record.target instanceof win.Element ? record.target : record.target.parentElement
      if (target?.closest(qualitySelector) || target === current?.video || target === current?.stage ||
        (record.type === 'attributes' && target?.matches(playerNodes))) {
        schedule()
        break
      }
      const changed = [...record.addedNodes, ...record.removedNodes].some((node) =>
        node instanceof win.Element && (node.matches(playerNodes) || node.querySelector(playerNodes)))
      if (changed) {
        schedule()
        break
      }
    }
  })
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: [
      'class', 'style', 'hidden', 'disabled', 'aria-disabled', 'aria-hidden',
      'aria-label', 'title', 'inert', 'data-disabled', 'data-e2e',
    ],
  })
  const events = new win.AbortController()
  const captured = { capture: true, signal: events.signal }
  for (const name of mediaEvents) {
    document.addEventListener(name, (event) => {
      if (event.target instanceof win.HTMLVideoElement) schedule()
    }, captured)
  }
  document.addEventListener('fullscreenchange', schedule, captured)
  win.addEventListener('resize', schedule, { signal: events.signal })

  return {
    /** @param {AbortSignal} signal @param {(player: Player | null) => void} listener */
    subscribe(signal, listener) {
      subscribers.add(listener)
      signal.addEventListener('abort', () => {
        subscribers.delete(listener)
        if (subscribers.size) return
        observer.disconnect()
        events.abort()
        win.clearTimeout(updateId)
        watchers.delete(document)
      }, { once: true })
      listener(findActivePlayer(document))
    },
  }
}
