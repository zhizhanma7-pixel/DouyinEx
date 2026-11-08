import { watchDanmaku } from '../adapters/douyin/danmaku.js'

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountDanmakuStats({ document, route, signal, view }) {
  const win = document.defaultView
  if (!win) return
  const { performance } = win
  const started = performance.now()
  let count = 0
  let lastId = 0
  let available = false

  function render() {
    const elapsed = Math.floor((performance.now() - started) / 1000)
    const rate = elapsed >= 10 ? `约 ${Math.round(count * 60 / elapsed)} 条/分钟` : '观测满 10 秒后估算频率'
    const status = available ? '' : ' · 当前聊天列表不可用'
    const summary = `观测 ${elapsed} 秒 · 新识别文本 ${count} 条 · ${rate}${status}。数据来自网页弹幕列表。`
    if (view.detail.textContent !== summary) view.detail.textContent = summary
  }

  view.detail.hidden = false
  watchDanmaku(document, route.key.slice(1), signal, (snapshot) => {
    let newest = lastId
    for (const { message } of snapshot.entries) {
      const id = Number(message.id)
      if (available && id > lastId) count += 1
      newest = Math.max(newest, id)
    }
    lastId = newest
    available = snapshot.available
    render()
  })
  const timer = win.setInterval(render, 1000)
  return {
    dispose() {
      win.clearInterval(timer)
      view.detail.textContent = ''
      view.detail.hidden = true
    },
  }
}
