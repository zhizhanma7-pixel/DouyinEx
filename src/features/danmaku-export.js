import { watchDanmaku } from '../adapters/douyin/danmaku.js'
import { actionButton } from '../ui/dom.js'
import { createLocalDownload } from '../ui/local-download.js'

const historyLimit = 500

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountDanmakuExport({ document, route, signal, view }) {
  /** @type {Map<string, {timestamp: number; text: string}>} */
  const history = new Map()
  const download = createLocalDownload(document)
  const status = document.createElement('p')
  const feedback = document.createElement('p')
  feedback.setAttribute('role', 'status')
  const button = actionButton(document, '生成弹幕 TXT', () => {
    if (!history.size) return
    const lines = [...history.values()].map(({ timestamp, text }) => `${new Date(timestamp).toISOString()}\t${text}`)
    const file = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' })
    feedback.textContent = download.prepare(file, 'danmaku', 'txt')
      ? '弹幕文本已就绪。' : '浏览器无法生成下载链接。'
  })
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(button, download.link)
  view.detail.append(status, actions, feedback)
  view.detail.hidden = false

  watchDanmaku(document, route.key.slice(1), signal, ({ entries }) => {
    for (const { message } of entries) {
      if (!history.has(message.id)) {
        history.set(message.id, { timestamp: message.timestamp, text: message.text })
        if (history.size > historyLimit) {
          const oldest = history.keys().next().value
          if (oldest) history.delete(oldest)
        }
      }
    }
    button.disabled = !history.size
    status.textContent = history.size ? `本次已观察 ${history.size} 条文本弹幕。` : '尚无可导出的文本弹幕。'
  })
  return {
    dispose() {
      history.clear()
      download.clear()
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}
