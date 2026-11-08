import { findActivePlayer, hasVideoFrames, watchPlayer } from '../adapters/douyin/player.js'
import { QUALITY_CONFIRM_TIMEOUT, readQuality } from '../adapters/douyin/quality.js'
import { readRoute } from '../adapters/douyin/route.js'
import { createPlayerControls } from '../ui/player-controls.js'

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountPlayerControls({ document, route, signal, view }) {
  const win = document.defaultView
  if (!win) return
  const browser = win
  /** @type {{video: HTMLVideoElement; restore: () => void} | null} */
  let crop = null
  /** @type {{label: string; timer: number} | null} */
  let pending = null
  /** @type {HTMLElement | null} */
  let ownedFullscreen = null
  const ui = createPlayerControls(view.detail, {
    quality: requestQuality,
    fullscreen: requestFullscreen,
    crop: toggleCrop,
  })
  watchPlayer(document, signal, render)
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== ownedFullscreen) ownedFullscreen = null
  }, { signal })

  function currentPlayer() {
    return readRoute(browser.location)?.key === route.key ? findActivePlayer(document) : null
  }

  /** @param {ReturnType<typeof findActivePlayer>} player */
  function render(player) {
    const video = player?.video
    if (crop && video !== crop.video) clearCrop()
    const ready = hasVideoFrames(player)
    const quality = player && ready ? readQuality(player.stage) : null
    if (pending && pending.label === quality?.current) {
      ui.notify(`网页已切换到 ${pending.label}。`)
      clearPending()
    }
    const status = playbackStatus(video)
    ui.update({
      status: quality?.current ? `${status} · 网页画质 ${quality.current}` : status,
      current: quality?.current ?? '',
      options: [...(quality?.options.keys() ?? [])],
      fullscreen: Boolean(ready && document.fullscreenEnabled && player?.stage.requestFullscreen && !document.fullscreenElement),
      crop: ready,
      cropped: Boolean(crop),
      pending: Boolean(pending),
    })
  }

  function clearPending() {
    if (pending) browser.clearTimeout(pending.timer)
    pending = null
  }

  /** @param {string} label */
  function requestQuality(label) {
    const player = currentPlayer()
    if (!player || !hasVideoFrames(player) || pending) return
    const { current, options } = readQuality(player.stage)
    const option = options.get(label)
    if (!option || label === current) {
      render(player)
      return
    }
    ui.notify(`已请求 ${label}，等待网页确认。`)
    pending = {
      label,
      timer: browser.setTimeout(() => {
        clearPending()
        const latest = currentPlayer()
        const confirmed = latest && readQuality(latest.stage).current === label
        ui.notify(confirmed ? `网页已切换到 ${label}。` : '网页尚未确认画质切换，可使用原生菜单。')
        render(latest)
      }, QUALITY_CONFIRM_TIMEOUT),
    }
    option.click()
    render(currentPlayer())
  }

  function requestFullscreen() {
    const player = currentPlayer()
    if (!player || !hasVideoFrames(player) || document.fullscreenElement ||
      !document.fullscreenEnabled || !player.stage.requestFullscreen) return
    const target = player.stage
    target.requestFullscreen().then(() => {
      if (document.fullscreenElement !== target) return
      if (signal.aborted) exitFullscreen()
      else ownedFullscreen = target
    }).catch(() => {
      if (!signal.aborted) ui.notify('浏览器未进入全屏，可使用原生全屏按钮。')
    })
  }

  function exitFullscreen() {
    document.exitFullscreen().catch(() => {})
  }

  function clearCrop() {
    crop?.restore()
    crop = null
  }

  function toggleCrop() {
    const player = currentPlayer()
    if (!player || !hasVideoFrames(player)) return
    if (crop?.video === player.video) clearCrop()
    else {
      clearCrop()
      crop = { video: player.video, restore: cropToFill(player.video) }
    }
    render(player)
  }

  return {
    dispose() {
      clearPending()
      clearCrop()
      if (ownedFullscreen && document.fullscreenElement === ownedFullscreen) exitFullscreen()
      ui.remove()
    },
  }
}

/** @param {HTMLVideoElement | undefined} video */
function playbackStatus(video) {
  if (!video) return '当前页面没有可用播放器。'
  if (video.error) return '播放器报告媒体错误。'
  if (video.ended) return '播放已结束。'
  if (video.readyState < 1 || !video.videoWidth) return '等待视频。'
  const state = video.paused ? '已暂停' : video.readyState < 3 ? '缓冲中' : '播放中'
  const volume = video.muted ? '静音' : `音量 ${Math.round(video.volume * 100)}%`
  return `${state} · ${video.videoWidth}×${video.videoHeight} · ${volume}`
}

/** @param {HTMLVideoElement} video */
function cropToFill(video) {
  const { style } = video
  const property = 'object-fit'
  const original = style.getPropertyValue(property)
  const priority = style.getPropertyPriority(property)
  const hadStyle = video.hasAttribute('style')
  style.setProperty(property, 'cover', 'important')
  return () => {
    if (style.getPropertyValue(property) !== 'cover' || style.getPropertyPriority(property) !== 'important') return
    if (original) style.setProperty(property, original, priority)
    else style.removeProperty(property)
    if (!hadStyle && !style.length) video.removeAttribute('style')
  }
}
