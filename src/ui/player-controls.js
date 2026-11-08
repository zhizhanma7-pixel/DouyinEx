/**
 * @param {HTMLElement} container
 * @param {{ quality(label: string): void; fullscreen(): void; crop(): void }} actions
 */
export function createPlayerControls(container, actions) {
  const doc = container.ownerDocument
  const status = doc.createElement('div')
  const label = doc.createElement('label')
  label.textContent = '直播画质'
  const select = doc.createElement('select')
  select.addEventListener('change', () => actions.quality(select.value))
  label.append(select)

  const toolbar = doc.createElement('div')
  toolbar.className = 'actions player-actions'
  const fullscreen = doc.createElement('button')
  fullscreen.type = 'button'
  fullscreen.textContent = '播放器全屏'
  fullscreen.addEventListener('click', actions.fullscreen)
  const crop = doc.createElement('button')
  crop.type = 'button'
  crop.textContent = '填满画面'
  crop.addEventListener('click', actions.crop)
  toolbar.append(label, fullscreen, crop)
  const feedback = doc.createElement('div')
  feedback.setAttribute('role', 'status')
  feedback.className = 'feedback'
  container.append(status, toolbar, feedback)
  container.hidden = false
  let optionKey = ''

  return {
    /**
     * @param {{ status: string; current: string; options: string[];
     *   fullscreen: boolean; crop: boolean; cropped: boolean; pending: boolean }} state
     */
    update(state) {
      status.textContent = state.status
      const labels = state.options
      const unavailable = labels.length ? '当前画质未知' : '原生画质不可用'
      const placeholder = labels.includes(state.current) ? '' : state.current || unavailable
      const nextKey = JSON.stringify([labels, placeholder])
      if (nextKey !== optionKey) {
        optionKey = nextKey
        select.replaceChildren()
        if (placeholder) {
          const option = doc.createElement('option')
          option.value = ''
          option.textContent = placeholder
          option.disabled = true
          select.append(option)
        }
        for (const item of labels) {
          const option = doc.createElement('option')
          option.value = item
          option.textContent = item
          select.append(option)
        }
      }
      select.value = labels.includes(state.current) ? state.current : ''
      select.disabled = state.pending || !labels.some((item) => item !== state.current)
      fullscreen.disabled = !state.fullscreen
      crop.disabled = !state.crop
      crop.setAttribute('aria-pressed', String(state.cropped))
    },
    /** @param {string} text */
    notify(text) { feedback.textContent = text },
    remove() {
      container.hidden = true
      container.replaceChildren()
    },
  }
}
