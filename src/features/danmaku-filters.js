import { watchDanmaku } from '../adapters/douyin/danmaku.js'
import { installDocumentStyle } from '../core/document-style.js'

const marker = 'data-douyinex-danmaku'
const styles = `
  #chatroom .webcast-chatroom___list .webcast-chatroom___item[${marker}="hidden"] { visibility: hidden !important; }
  #chatroom .webcast-chatroom___list .webcast-chatroom___item[${marker}="dim"] { opacity: .65 !important; }
`
const defaults = { keywords: '', duplicates: true, dim: false }

/** @param {string} raw */
function decode(raw) {
  try {
    const value = JSON.parse(raw)
    if (typeof value?.keywords === 'string' && value.keywords.length <= 500 &&
      typeof value.duplicates === 'boolean' && typeof value.dim === 'boolean') return value
  } catch {
    return defaults
  }
  return defaults
}

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountDanmakuFilters({ document, route, signal, view, storage }) {
  let preferences = decode(storage.read())
  let keywords = parseKeywords(preferences.keywords)
  /** @type {Set<Element>} */
  let marked = new Set()
  /** @type {import('../adapters/douyin/danmaku.js').Snapshot} */
  let snapshot = { available: false, entries: [] }
  const removeStyle = installDocumentStyle(document, styles)
  const status = document.createElement('p')
  const keywordLabel = document.createElement('label')
  keywordLabel.textContent = '屏蔽关键词（逗号或换行分隔）'
  const input = document.createElement('textarea')
  input.rows = 2
  input.maxLength = 500
  input.value = preferences.keywords
  keywordLabel.append(input)
  const duplicates = checkbox('隐藏重复弹幕', preferences.duplicates)
  const dim = checkbox('降低弹幕亮度', preferences.dim)
  const save = document.createElement('button')
  save.type = 'button'
  save.textContent = '保存弹幕设置'
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(save)
  const feedback = document.createElement('p')
  feedback.setAttribute('role', 'status')
  feedback.className = 'feedback'
  view.detail.append(status, keywordLabel, duplicates.label, dim.label, actions, feedback)
  view.detail.hidden = false

  save.addEventListener('click', () => {
    const next = { keywords: input.value.trim(), duplicates: duplicates.input.checked, dim: dim.input.checked }
    const terms = parseKeywords(next.keywords)
    if (next.keywords.length > 500 || terms.length > 20) {
      feedback.textContent = '请输入最多 20 个关键词。'
      return
    }
    if (!storage.write(JSON.stringify(next))) {
      feedback.textContent = '无法保存弹幕设置。'
      return
    }
    preferences = next
    keywords = terms
    feedback.textContent = '已保存弹幕设置。'
    render()
  }, { signal })

  watchDanmaku(document, route.key.slice(1), signal, (next) => {
    snapshot = next
    render()
  })

  /** @param {string} labelText @param {boolean} checked */
  function checkbox(labelText, checked) {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    label.append(input, document.createTextNode(labelText))
    return { label, input }
  }

  function render() {
    const seen = new Set()
    const active = new Set()
    let count = 0
    for (const { node, message } of snapshot.entries) {
      const normalized = normalize(message.text)
      const hidden = keywords.some((term) => normalized.includes(term)) || (preferences.duplicates && seen.has(normalized))
      seen.add(normalized)
      const value = hidden ? 'hidden' : preferences.dim ? 'dim' : ''
      if (!value) continue
      if (node.getAttribute(marker) !== value) node.setAttribute(marker, value)
      active.add(node)
      if (hidden) count += 1
    }
    for (const node of marked) if (!active.has(node)) node.removeAttribute(marker)
    marked = active
    const summary = snapshot.entries.length
      ? `当前识别 ${snapshot.entries.length} 条，隐藏 ${count} 条。`
      : snapshot.available ? '尚无可识别的文本弹幕。' : '当前房间没有可用弹幕列表。'
    if (status.textContent !== summary) status.textContent = summary
  }

  return {
    dispose() {
      for (const node of marked) node.removeAttribute(marker)
      removeStyle()
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}

/** @param {string} text */
function normalize(text) {
  return text.normalize('NFKC').toLowerCase()
}

/** @param {string} text */
function parseKeywords(text) {
  return [...new Set(text.split(/[\n,，]+/).map((item) => normalize(item.trim())).filter(Boolean))]
}
