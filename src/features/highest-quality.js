import { hasVideoFrames, watchPlayer } from '../adapters/douyin/player.js'
import { QUALITY_CONFIRM_TIMEOUT, qualityRank, readQuality } from '../adapters/douyin/quality.js'
import { readRoute } from '../adapters/douyin/route.js'

// A reused video belongs to its previous room until the browser reports new media.
/** @type {WeakMap<HTMLVideoElement, string>} */
const videoRooms = new WeakMap()

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountHighestQuality({ document, route, signal, view }) {
  const win = document.defaultView
  if (!win) return
  let attempted = false
  let requested = ''
  /** @type {number | undefined} */
  let timer
  const detail = view.detail
  detail.hidden = false
  detail.textContent = '等待播放器提供可选画质。'
  document.addEventListener('loadedmetadata', (event) => {
    if (readRoute(win.location)?.key === route.key && event.target instanceof win.HTMLVideoElement) {
      videoRooms.set(event.target, route.key)
    }
  }, { capture: true, signal })

  watchPlayer(document, signal, (player) => {
    if ((!requested && attempted) || !player || !hasVideoFrames(player) || readRoute(win.location)?.key !== route.key) return
    const lastRoom = videoRooms.get(player.video)
    if (lastRoom && lastRoom !== route.key) return
    videoRooms.set(player.video, route.key)
    const { current, options } = readQuality(player.stage)
    if (requested) {
      if (current === requested) {
        win.clearTimeout(timer)
        detail.textContent = `网页已切换到 ${requested}。`
        requested = ''
      }
      return
    }
    if (!current || !options.size) return
    const best = [...options.keys()].sort((a, b) => qualityRank(b) - qualityRank(a))[0]
    attempted = true
    if (qualityRank(best) <= qualityRank(current)) {
      detail.textContent = '已保留当前画质。'
      return
    }
    requested = best
    detail.textContent = `已请求 ${best}，等待网页确认。`
    timer = win.setTimeout(() => {
      detail.textContent = '网页尚未确认最高画质请求，可使用原生菜单。'
      requested = ''
    }, QUALITY_CONFIRM_TIMEOUT)
    options.get(best)?.click()
  })

  return {
    dispose() {
      win.clearTimeout(timer)
      detail.hidden = true
      detail.textContent = ''
    },
  }
}
