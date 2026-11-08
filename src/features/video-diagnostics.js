/** @type {import('../core/types.js').Feature} */
export const videoDiagnostics = {
  id: 'video-diagnostics',
  label: '查看视频元素状态',
  section: 'diagnostics',
  defaultEnabled: false,
  capabilities: (route) => route.kind === 'room' ? 'supported' : 'unsupported',
  mount({ document, view }) {
    const win = document.defaultView
    if (!win) return

    /** @type {HTMLVideoElement | null} */
    let video = null
    function update() {
      if (video?.isConnected) return
      video = document.querySelector('video')
      view.detail.textContent = video ? '已检测到视频元素' : '当前页面未检测到视频元素'
    }

    const observer = new win.MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    update()
    view.detail.hidden = false

    return {
      dispose() {
        observer.disconnect()
        view.detail.hidden = true
        view.detail.textContent = ''
      },
    }
  },
}
