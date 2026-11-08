import { findActivePlayer, hasVideoFrames, watchPlayer } from '../adapters/douyin/player.js'
import { actionButton } from '../ui/dom.js'

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountPictureInPicture({ document, signal, view }) {
  /** @type {HTMLVideoElement | null} */
  let owned = null
  let pending = false
  let feedback = ''
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  const button = actionButton(document, '进入画中画', () => { void toggle() })
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(button)
  view.detail.append(actions, status)
  view.detail.hidden = false

  function supported() {
    const player = findActivePlayer(document)
    if (player && hasVideoFrames(player) && document.pictureInPictureEnabled &&
      !player.video.disablePictureInPicture && typeof player.video.requestPictureInPicture === 'function') return player.video
    return null
  }

  function render() {
    const active = Boolean(owned && document.pictureInPictureElement === owned)
    const video = supported()
    button.textContent = active ? '退出画中画' : '进入画中画'
    button.disabled = pending || (!active && (!video || Boolean(document.pictureInPictureElement)))
    if (owned && !active) owned = null
    status.textContent = feedback || (!video && !active ? '当前视频或浏览器未开放画中画，可继续在网页观看。' : '')
  }

  async function toggle() {
    if (pending) return
    pending = true
    try {
      if (owned && document.pictureInPictureElement === owned) await document.exitPictureInPicture()
      else {
        const video = supported()
        if (!video || document.pictureInPictureElement) return
        await video.requestPictureInPicture()
        if (signal.aborted && document.pictureInPictureElement === video) await document.exitPictureInPicture()
        else owned = video
      }
      feedback = ''
    } catch {
      feedback = '浏览器未完成画中画操作，请使用网页播放器。'
    } finally {
      pending = false
      if (!signal.aborted) render()
    }
  }

  watchPlayer(document, signal, render)
  for (const event of ['enterpictureinpicture', 'leavepictureinpicture']) {
    document.addEventListener(event, render, { capture: true, signal })
  }
  return {
    dispose() {
      if (owned && document.pictureInPictureElement === owned) void document.exitPictureInPicture().catch(() => {})
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}
