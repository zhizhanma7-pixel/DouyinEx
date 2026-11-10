const scopeSelector = '#chatroom'
const editorSelector = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'
const nativeSendSelector = '.webcast-chatroom___send-btn'
const sendLabels = new Set(['发送', '发 送', 'Send'])
// Assumed Douyin web chat limit; an explicit maxlength on the editor wins.
const fallbackLimit = 50

/** @typedef {HTMLTextAreaElement | HTMLElement} Editor */

/** @param {Element} element */
function usable(element) {
  if (element.closest('[hidden],[aria-hidden="true"]')) return false
  if (element.localName === 'textarea') {
    const area = /** @type {HTMLTextAreaElement} */ (element)
    return !area.disabled && !area.readOnly
  }
  return element.getAttribute('aria-disabled') !== 'true'
}

/** @param {Document} document @returns {Editor | null} */
export function findChatEditor(document) {
  const scope = document.querySelector(scopeSelector)
  if (!scope) return null
  for (const element of scope.querySelectorAll(editorSelector)) {
    // Ignore our own and other nested editors inside chat rows.
    if (element.closest('.webcast-chatroom___list')) continue
    if (usable(element)) return /** @type {Editor} */ (element)
  }
  return null
}

/** @param {Editor} editor @returns {Element | null} */
export function findSendButton(editor) {
  const composer = editor.closest('#chatInput')
  const nativeSend = composer?.querySelector(nativeSendSelector)
  if (nativeSend) return nativeSend
  let container = editor.parentElement
  for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
    for (const candidate of container.querySelectorAll('button,[role="button"]')) {
      if (sendLabels.has((candidate.getAttribute('aria-label') ?? candidate.textContent ?? '').trim())) return candidate
    }
    if (container === composer || container.id === 'chatroom') break
  }
  return null
}

/** @param {Editor} editor */
export function clickChatSend(editor) {
  const button = findSendButton(editor)
  const win = editor.ownerDocument.defaultView
  if (!win || !button?.isConnected || button.closest('[hidden],[aria-hidden="true"],[inert]') ||
    button.matches(':disabled,[disabled],[aria-disabled="true"],.webcast-chatroom___send-btn.disable')) return false
  if (button instanceof win.HTMLElement) button.click()
  else button.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))
  return true
}

/** @param {Editor} editor */
export function chatLimit(editor) {
  const explicit = Number(editor.getAttribute('maxlength'))
  return Number.isInteger(explicit) && explicit > 0 ? explicit : fallbackLimit
}

/** @param {string} text */
export function textLength(text) {
  return [...text].length
}

/** @param {Editor} editor */
export function readDraft(editor) {
  if (editor.localName === 'textarea') return /** @type {HTMLTextAreaElement} */ (editor).value
  const text = editor.textContent ?? ''
  return text === '\u200B' && editor.querySelector('[data-enter="true"],[data-slate-zero-width]') ? '' : text
}

/** @param {Editor} editor */
function selectDraft(editor) {
  editor.focus()
  const selection = editor.ownerDocument.getSelection()
  if (!selection) return
  const range = editor.ownerDocument.createRange()
  range.selectNodeContents(editor)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Stage a send through the rich editor's paste handler when available. @param {Editor} editor @param {string} text */
export function stageChatMessage(editor, text) {
  if (readDraft(editor) === text) return true
  const win = editor.ownerDocument.defaultView
  if (editor.matches('[data-slate-editor="true"]') && win?.DataTransfer && win.ClipboardEvent) {
    selectDraft(editor)
    const clipboardData = new win.DataTransfer()
    clipboardData.setData('text/plain', text)
    const handled = !editor.dispatchEvent(new win.ClipboardEvent('paste', {
      clipboardData, bubbles: true, cancelable: true, composed: true,
    }))
    if (handled || readDraft(editor) === text) return true
  }
  return writeDraft(editor, text)
}

/**
 * Replace the draft the way a user edit would, so framework-controlled inputs
 * pick up the change. Returns whether the editor now holds exactly `text`.
 * @param {Editor} editor @param {string} text
 */
export function writeDraft(editor, text) {
  const document = editor.ownerDocument
  const win = document.defaultView
  if (!win) return false
  const Input = win.InputEvent ?? win.Event
  const notify = () => editor.dispatchEvent(new Input('input', { bubbles: true, cancelable: false }))
  try {
    if (editor.localName === 'textarea') {
      const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')?.set
      if (!setter) return false
      setter.call(editor, text)
      notify()
    } else {
      selectDraft(editor)
      // Rich editors only stay in sync with edits that go through the browser.
      const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)
      if (!inserted || readDraft(editor) !== text) {
        editor.textContent = text
        notify()
      }
    }
  } catch {
    return false
  }
  return readDraft(editor) === text
}
