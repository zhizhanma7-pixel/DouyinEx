import { chatLimit, findChatEditor, findSendButton, readDraft, textLength, writeDraft } from '../adapters/douyin/chat-input.js'

const contentLimit = 20
/** @typedef {{mode: 'prefix' | 'suffix'; content: string}} TailConfig */
/** @type {TailConfig} */
const defaults = { mode: 'suffix', content: '' }
/** @type {WeakMap<Document, (text: string) => string>} */
const active = new WeakMap()

/** @param {string} raw @returns {TailConfig} */
function decodeConfig(raw) {
  try {
    const value = JSON.parse(raw)
    if ((value?.mode === 'prefix' || value?.mode === 'suffix') && typeof value.content === 'string' &&
      textLength(value.content) <= contentLimit) return { mode: value.mode, content: value.content }
  } catch {
    return defaults
  }
  return defaults
}

/**
 * Add the tail once. Text that is empty or already carries the tail is returned unchanged.
 * @param {string} text @param {TailConfig} config
 */
export function decorate(text, config) {
  const body = text.trim()
  const content = config.content
  if (!body || !content.trim()) return text
  if (config.mode === 'prefix') return body.startsWith(content) ? text : `${content}${body}`
  return body.endsWith(content) ? text : `${body}${content}`
}

/** The text a draft would be sent as, or the draft itself when the tail is off. @param {Document} document @param {string} text */
export function previewTail(document, text) {
  return active.get(document)?.(text) ?? text
}

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountDanmakuTail({ document, signal, view, storage }) {
  const win = document.defaultView
  if (!win) return
  const browser = win
  let config = decodeConfig(storage.read())
  let applying = false
  const modeLabel = document.createElement('label')
  modeLabel.textContent = '位置 '
  const mode = document.createElement('select')
  for (const [value, text] of [['suffix', '后缀'], ['prefix', '前缀']]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = text
    mode.append(option)
  }
  mode.value = config.mode
  modeLabel.append(mode)
  const contentLabel = document.createElement('label')
  contentLabel.textContent = `小尾巴内容（最多 ${contentLimit} 字）`
  const content = document.createElement('input')
  content.type = 'text'
  content.placeholder = '【DouyinEx】'
  content.value = config.content
  contentLabel.append(content)
  const bypassLabel = document.createElement('label')
  const bypass = document.createElement('input')
  bypass.type = 'checkbox'
  bypassLabel.append(bypass, document.createTextNode('暂时不加（刷新后恢复）'))
  const save = document.createElement('button')
  save.type = 'button'
  save.textContent = '保存小尾巴'
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(save)
  const preview = document.createElement('p')
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  view.detail.append(modeLabel, contentLabel, bypassLabel, actions, preview, status)
  view.detail.hidden = false

  /** @param {string} text */
  const tail = (text) => bypass.checked ? text : decorate(text, config)
  active.set(document, tail)

  function renderPreview() {
    preview.textContent = config.content.trim()
      ? `示例：${decorate('今天主播打得不错', config)}`
      : '尚未设置小尾巴内容。'
  }

  save.addEventListener('click', () => {
    const next = { mode: mode.value === 'prefix' ? 'prefix' : 'suffix', content: content.value }
    if (textLength(next.content) > contentLimit) {
      status.textContent = `小尾巴最多 ${contentLimit} 个字。`
      return
    }
    if (!storage.write(JSON.stringify(next))) {
      status.textContent = '无法保存小尾巴设置。'
      return
    }
    config = /** @type {TailConfig} */ (next)
    status.textContent = '已保存小尾巴设置。'
    renderPreview()
  }, { signal })
  bypass.addEventListener('change', () => {
    status.textContent = bypass.checked ? '已暂停小尾巴。' : ''
  }, { signal })

  /** @param {EventTarget | null} target */
  function editorFor(target) {
    const editor = findChatEditor(document)
    return editor && target instanceof browser.Node && editor.contains(target) ? editor : null
  }

  /** @param {import('../adapters/douyin/chat-input.js').Editor} editor */
  function apply(editor) {
    if (applying || bypass.checked) return
    const draft = readDraft(editor)
    const next = tail(draft)
    if (next === draft) return
    if (textLength(next) > chatLimit(editor)) {
      status.textContent = '加上小尾巴会超出字数限制，本条未添加。'
      return
    }
    applying = true
    try {
      if (!writeDraft(editor, next)) status.textContent = '无法修改输入框，本条未添加小尾巴。'
    } finally {
      applying = false
    }
  }

  document.addEventListener('keydown', (event) => {
    // keyCode 229 marks IME composition in browsers that do not set isComposing.
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 ||
      event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
    const editor = editorFor(event.target)
    if (editor) apply(editor)
  }, { capture: true, signal })
  // Apply on press as well as click so frameworks re-render before their click handler reads the draft.
  for (const type of ['pointerdown', 'click']) {
    document.addEventListener(type, (event) => {
      const editor = findChatEditor(document)
      const button = editor && findSendButton(editor)
      if (button && event.target instanceof browser.Node && button.contains(event.target)) apply(editor)
    }, { capture: true, signal })
  }

  renderPreview()
  if (!findChatEditor(document)) status.textContent = '暂未找到聊天输入框（可能未登录或房间禁止发言），找到后自动生效。'

  return {
    dispose() {
      if (active.get(document) === tail) active.delete(document)
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}
