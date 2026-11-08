import { findActivePlayer, hasVideoFrames } from '../adapters/douyin/player.js'

const controls = 'a[href],button,input,select,textarea,[contenteditable]:not([contenteditable="false"]),' +
  '[role="button"],[role="slider"],[role="dialog"],dialog,.douyin-player-controls,[data-e2e="quality-selector"],#GiftMenuLayout'

/** @param {Document} document @param {AbortSignal} signal */
export function mountVolumeWheel(document, signal) {
  const win = document.defaultView
  if (!win) return
  document.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.shiftKey || event.altKey ||
      event.metaKey || !event.deltaY || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    const target = event.target
    if (!(target instanceof win.Element) || !target.closest('.douyin-player') ||
      target.closest(controls)) return
    const player = findActivePlayer(document)
    if (!player || !hasVideoFrames(player) || !player.stage.contains(target)) return
    const rect = player.video.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX >= rect.right ||
      event.clientY < rect.top || event.clientY >= rect.bottom) return
    const step = event.deltaY < 0 ? 5 : -5
    player.video.volume = Math.max(0, Math.min(100, Math.round(player.video.volume * 100) + step)) / 100
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true, passive: false, signal })
}

/** @param {Document} document @param {AbortSignal} signal */
export function mountPauseGuard(document, signal) {
  const win = document.defaultView
  if (!win) return
  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.detail === 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey ||
      !(event.target instanceof win.HTMLVideoElement)) return
    const player = findActivePlayer(document)
    if (player?.video !== event.target || player.video.paused || player.video.controls || !hasVideoFrames(player)) return
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true, signal })
}
