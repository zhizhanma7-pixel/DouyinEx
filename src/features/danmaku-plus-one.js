import { chatLimit, findChatEditor, readDraft, textLength, writeDraft } from '../adapters/douyin/chat-input.js'
import { readDanmakuRow, watchDanmaku } from '../adapters/douyin/danmaku.js'
import { actionButton } from '../ui/dom.js'
import { previewTail } from './danmaku-tail.js'

const clickCooldown = 800
const floatingStyles = `
  :host { all: initial; position: fixed; z-index: 10001; }
  :host([hidden]) { display: none !important; }
  button {
    min-inline-size: 34px; min-block-size: 24px; padding: 0 8px;
    border: 1px solid #47625e; border-radius: 999px;
    background: #171e29; color: #83f5dc; cursor: pointer;
    font: 600 12px/22px system-ui, "Microsoft YaHei", sans-serif;
    box-shadow: 0 3px 10px #0006;
  }
  button:focus-visible { outline: 2px solid #83f5dc; outline-offset: 2px; }
`

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountDanmakuPlusOne({ document, route, signal, view }) {
  const win = document.defaultView
  if (!win) return
  const browser = win
  /** @type {Map<Element, import('../adapters/douyin/danmaku.js').Danmaku>} */
  let rows = new Map()
  /** @type {{node: Element; id: string} | null} */
  let hovered = null
  const used = new Set()
  let lastClick = -Infinity
  let previousDraft = ''

  const host = document.createElement('douyinex-plus-one')
  const root = host.attachShadow({ mode: 'open' })
  if ('adoptedStyleSheets' in root && typeof win.CSSStyleSheet.prototype.replaceSync === 'function') {
    const sheet = new win.CSSStyleSheet()
    sheet.replaceSync(floatingStyles)
    root.adoptedStyleSheets = [sheet]
  } else {
    const style = document.createElement('style')
    style.textContent = floatingStyles
    root.append(style)
  }
  const plusOne = document.createElement('button')
  plusOne.type = 'button'
  plusOne.textContent = '+1'
  plusOne.setAttribute('aria-label', '+1：放入输入框')
  root.append(plusOne)
  host.hidden = true
  document.body.append(host)

  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  const guide = document.createElement('p')
  const restore = actionButton(document, '恢复原草稿', () => {
    const editor = findChatEditor(document)
    if (!editor || !writeDraft(editor, previousDraft)) {
      status.textContent = '无法恢复原草稿。'
      return
    }
    previousDraft = ''
    restore.hidden = true
    status.textContent = '已恢复原草稿。'
  })
  restore.hidden = true
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(restore)
  view.detail.append(guide, status, actions)
  view.detail.hidden = false

  watchDanmaku(document, route.key.slice(1), signal, ({ available, entries }) => {
    rows = new Map(entries.map(({ node, message }) => [node, message]))
    if (hovered && rows.get(hovered.node)?.id !== hovered.id) hide()
    else position()
    const hint = entries.length ? '把鼠标移到普通文字弹幕上，点击 +1 放入输入框。'
      : available ? '当前还没有识别到可 +1 的文字弹幕。' : '当前房间没有可用的弹幕列表。'
    if (guide.textContent !== hint) guide.textContent = hint
  })

  function hide() {
    hovered = null
    host.hidden = true
  }

  /** @param {Element} node @param {import('../adapters/douyin/danmaku.js').Danmaku} message */
  function show(node, message) {
    hovered = { node, id: message.id }
    plusOne.title = previewTail(document, message.text)
    position()
  }

  function position() {
    if (!hovered) return
    const rect = hovered.node.getBoundingClientRect()
    const clip = hovered.node.closest('.webcast-chatroom___list')?.getBoundingClientRect()
    if (clip?.height && (rect.bottom <= clip.top || rect.top >= clip.bottom)) {
      hide()
      return
    }
    host.style.top = `${Math.max(0, rect.top + (rect.height - 24) / 2)}px`
    host.style.left = `${Math.max(0, Math.min(rect.right - 44, browser.innerWidth - 44))}px`
    host.hidden = false
  }

  document.addEventListener('pointerover', ({ target }) => {
    if (target === host) return
    let node = target instanceof browser.Element ? target : null
    for (; node; node = node.parentElement) {
      const message = rows.get(node)
      if (message) {
        if (hovered?.node !== node || hovered.id !== message.id) show(node, message)
        return
      }
    }
    hide()
  }, { capture: true, signal })
  document.addEventListener('scroll', position, { capture: true, passive: true, signal })

  plusOne.addEventListener('click', () => {
    const now = browser.performance.now()
    if (now - lastClick < clickCooldown) return
    lastClick = now
    const target = hovered
    const message = target && rows.get(target.node)
    const current = target?.node.isConnected ? readDanmakuRow(target.node) : null
    if (!target || !message || message.id !== target.id ||
      !current || current.author !== message.author || current.text !== message.text) {
      status.textContent = '这条弹幕已刷新，请重新选择。'
      hide()
      return
    }
    if (used.has(message.id)) {
      status.textContent = '这条弹幕已经 +1 过了。'
      return
    }
    const editor = findChatEditor(document)
    if (!editor) {
      status.textContent = '未找到聊天输入框，可能未登录或房间禁止发言。'
      return
    }
    const finalText = previewTail(document, message.text)
    if (textLength(finalText) > chatLimit(editor)) {
      status.textContent = `超出 ${chatLimit(editor)} 字限制，未放入输入框。`
      return
    }
    const draft = readDraft(editor)
    if (!writeDraft(editor, message.text)) {
      status.textContent = `无法写入输入框，请手动复制：${message.text}`
      return
    }
    used.add(message.id)
    if (draft.trim() && draft !== message.text) {
      previousDraft = draft
      restore.hidden = false
    }
    editor.focus()
    hide()
    status.textContent = `已放入输入框，按 Enter 或发送按钮发送：${finalText}`
  }, { signal })

  return {
    dispose() {
      host.remove()
      rows.clear()
      used.clear()
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}
