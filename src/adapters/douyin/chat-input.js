// The logged-in chat composer has not been inspected in a real room yet. Every
// assumption about it lives here so a page change only needs this file updated.
const scopeSelector = '#chatroom'
const editorSelector = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'
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
  let container = editor.parentElement
  for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
    for (const candidate of container.querySelectorAll('button,[role="button"]')) {
      if (sendLabels.has((candidate.textContent ?? '').trim())) return candidate
    }
    if (container.id === 'chatroom') break
  }
  return null
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
  return editor.textContent ?? ''
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
      editor.focus()
      const selection = win.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(editor)
        selection.removeAllRanges()
        selection.addRange(range)
      }
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
