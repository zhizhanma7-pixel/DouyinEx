import { installDocumentStyle } from '../core/document-style.js'

const canvasSelector = '#DanmakuLayout .CanvasDanmakuPlugin > canvas'
const laneHeight = 30
const topMargin = 40
const maxLanes = 6
const maxItems = 36
const buttonWidth = 36
const styles = `
  :host {
    all: initial; position: absolute; inset: 0; display: block;
    overflow: hidden; pointer-events: none; container-type: inline-size;
  }
  .item {
    position: absolute; left: 100%; width: max-content; height: 26px;
    pointer-events: auto; white-space: nowrap; color: #fff;
    font: 600 20px/26px system-ui, sans-serif;
    text-shadow: 0 1px 3px #000, 0 0 4px #000;
    animation: fly var(--duration, 8s) linear both;
  }
  @keyframes fly { to { transform: translateX(calc(-100% - 100cqw)); } }
  .item:hover, .item:has(button:focus-visible) {
    animation-play-state: paused; z-index: 1; background: #161616c9;
  }
  button {
    position: absolute; left: 100%; top: 0; box-sizing: border-box;
    width: ${buttonWidth}px; height: 26px; padding: 0; border: 1px solid #47625e;
    border-radius: 999px; background: #171e29; color: #83f5dc;
    font: 600 12px system-ui, sans-serif; cursor: pointer; visibility: hidden;
  }
  .item:hover button, button:focus-visible { visibility: visible; }
`

/**
 * The native canvas has no element per message. Replay newly observed chat
 * text in the same player region so individual items can receive pointer events.
 * @param {Document} document
 * @param {(message: import('../adapters/douyin/danmaku.js').Danmaku) => void} onPlusOne
 */
export function createScreenDanmaku(document, onPlusOne) {
  const win = document.defaultView
  if (!win) return null
  const host = document.createElement('douyinex-screen-danmaku')
  const root = host.attachShadow({ mode: 'open' })
  const Sheet = win.CSSStyleSheet
  if (Sheet && typeof Sheet.prototype.replaceSync === 'function' && 'adoptedStyleSheets' in root) {
    const sheet = new Sheet()
    sheet.replaceSync(styles)
    root.adoptedStyleSheets = [sheet]
  } else {
    const style = document.createElement('style')
    style.textContent = styles
    root.append(style)
  }
  const restoreCanvas = installDocumentStyle(document, `
    ${canvasSelector}:has(+ douyinex-screen-danmaku) { opacity: 0 !important; }
    douyinex-screen-danmaku:not(canvas + douyinex-screen-danmaku) { display: none; }
  `)
  /** @type {HTMLElement[]} */
  const laneTails = []
  /** @type {number | null} */
  let lastSeen = null

  function clear() {
    host.remove()
    for (const item of root.querySelectorAll('.item')) item.remove()
    laneTails.length = 0
  }

  return {
    /** @param {import('../adapters/douyin/danmaku.js').Snapshot} snapshot */
    update({ available, entries }) {
      if (!available) {
        clear()
        return
      }
      let latest = lastSeen ?? 0
      const fresh = entries.filter(({ message }) => {
        const sequence = Number(message.id)
        latest = Math.max(latest, sequence)
        return lastSeen !== null && sequence > lastSeen
      })
      lastSeen = latest

      const canvas = document.querySelector(canvasSelector)
      if (!canvas || win.getComputedStyle(canvas).display === 'none' || win.getComputedStyle(canvas).visibility === 'hidden') {
        clear()
        return
      }
      if (!fresh.length) return
      if (canvas.nextElementSibling !== host) {
        clear()
        canvas.after(host)
      }

      const frame = host.getBoundingClientRect()
      const lanes = Math.max(1, Math.min(maxLanes, Math.floor((frame.height / 2 - topMargin) / laneHeight)))
      let count = root.querySelectorAll('.item').length
      for (const { message } of fresh.slice(-lanes)) {
        if (count >= maxItems) break
        const lane = Array.from({ length: lanes }, (_, index) => index).find((index) => {
          const tail = laneTails[index]
          return !tail?.isConnected || tail.getBoundingClientRect().right < frame.right - 16
        })
        if (lane === undefined) break

        const item = document.createElement('div')
        item.className = 'item'
        item.textContent = message.text
        item.style.top = `${topMargin + lane * laneHeight}px`
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = '+1'
        button.setAttribute('aria-label', '+1：发送弹幕')
        item.append(button)
        item.addEventListener('pointerenter', () => {
          const rect = item.getBoundingClientRect()
          const bounds = host.getBoundingClientRect()
          const left = rect.right + buttonWidth <= bounds.right ? rect.width : -buttonWidth
          button.style.left = `${Math.max(bounds.left - rect.left, Math.min(left, bounds.right - rect.left - buttonWidth))}px`
        })
        button.addEventListener('mousedown', (event) => event.preventDefault())
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          onPlusOne(message)
        })
        item.addEventListener('animationend', () => item.remove(), { once: true })
        root.append(item)
        const seconds = (frame.width + item.offsetWidth) / Math.max(120, frame.width / 8)
        item.style.setProperty('--duration', `${seconds}s`)
        laneTails[lane] = item
        count += 1
      }
    },
    dispose() {
      clear()
      restoreCanvas()
    },
  }
}
