/**
 * @param {Window} win
 * @param {HTMLElement} host
 */
export function watchSettingsDock(win, host) {
  let inRoom = false

  function position() {
    const width = win.document.documentElement.clientWidth || win.innerWidth
    const video = inRoom && width >= 760 ? win.document.querySelector('video') : null
    const rect = video?.getBoundingClientRect()
    const available = rect ? width - rect.right : 0
    if (rect && rect.width > 0 && rect.right >= 350 && available >= 158) {
      host.style.setProperty('--douyinex-inline-end', `${available - 140}px`)
      const bottom = Math.max(18, Math.min(120, win.innerHeight - rect.bottom))
      host.style.setProperty('--douyinex-block-end', `${bottom}px`)
    } else {
      host.style.removeProperty('--douyinex-inline-end')
      host.style.removeProperty('--douyinex-block-end')
    }
  }

  win.addEventListener('resize', position)
  win.document.addEventListener('loadedmetadata', position, true)
  return {
    /** @param {import('../../core/types.js').Route} route */
    update(route) {
      inRoom = route.kind === 'room'
      position()
    },
    remove() {
      win.removeEventListener('resize', position)
      win.document.removeEventListener('loadedmetadata', position, true)
    },
  }
}
