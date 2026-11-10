// The container is visible on public room pages. Row markers are a compatibility
// contract and are ignored when the expected author and body are absent.
const listSelector = '#chatroom .webcast-chatroom___list'
const rowSelector = '.webcast-chatroom___item'
const authorSelector = '.webcast-chatroom___nickname'
const bodySelector = '.webcast-chatroom___content-with-emoji-text'
const bodyPartSelector = `${bodySelector},.webcast-chatroom___content-with-emoji-emoji`
const omitted = '[hidden],[aria-hidden="true"],script,style,button,input,textarea,select,[contenteditable],svg'
const editors = 'form,input,textarea,select,[contenteditable]'
const maxRows = 180

/** @typedef {{id: string; roomId: string; author: string; text: string; timestamp: number; kind: 'text'; source: 'visible-dom'}} Danmaku */
/** @typedef {{node: Element; message: Danmaku}} Entry */
/** @typedef {{available: boolean; entries: Entry[]}} Snapshot */
/** @type {WeakMap<Document, Map<string, ReturnType<typeof createWatcher>>>} */
const watchers = new WeakMap()
/** @type {WeakMap<Element, {roomId: string; author: string; text: string}>} */
const rowRooms = new WeakMap()

/** @param {Node} node @returns {string} */
function readText(node) {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const element = /** @type {Element} */ (node)
  if (element.matches(omitted)) return ''
  const win = element.ownerDocument.defaultView
  if (win && element instanceof win.HTMLElement &&
    (element.style.display === 'none' || element.style.visibility === 'hidden')) return ''
  if (element.localName === 'img') return (element.getAttribute('alt') ?? '').slice(0, 32)
  return [...element.childNodes].map(readText).join('')
}

/** @param {Element} row */
export function readDanmakuRow(row) {
  if (row.closest('[hidden],[aria-hidden="true"]') || row.querySelector(editors)) return null
  if (row.querySelector('.webcast-chatroom__room-message')) return null

  const part = row.querySelector(bodyPartSelector)
  const container = part?.parentElement
  const nickname = container?.previousElementSibling
  // The current layout puts nickname and message in adjacent spans inside the row wrapper.
  const inline = container?.matches('span') && nickname?.matches('span') &&
    container.parentElement?.parentElement?.matches('.webcast-chatroom___item-wrapper') &&
    /[：:]$/.test(readText(nickname).trim()) &&
    Array.from(container.children).every((child) => child.matches(bodyPartSelector))
  const authorNode = inline ? nickname : row.querySelector(authorSelector)
  const bodyNode = inline ? container : row.querySelector(bodySelector)
  if (!authorNode || !bodyNode || bodyNode.contains(authorNode) || authorNode.contains(bodyNode)) return null
  const author = readText(authorNode).trim().replace(/[：:]$/, '').trim().slice(0, 100)
  const text = readText(bodyNode).replace(/\s+/g, ' ').trim().slice(0, 500)
  return author && text ? { author, text } : null
}

/**
 * @param {Document} document
 * @param {string} roomId
 * @param {AbortSignal} signal
 * @param {(snapshot: Snapshot) => void} listener
 */
export function watchDanmaku(document, roomId, signal, listener) {
  let rooms = watchers.get(document)
  if (!rooms) {
    rooms = new Map()
    watchers.set(document, rooms)
  }
  let watcher = rooms.get(roomId)
  if (!watcher) {
    const sessions = rooms
    watcher = createWatcher(document, roomId, () => {
      sessions.delete(roomId)
      if (!sessions.size) watchers.delete(document)
    })
    rooms.set(roomId, watcher)
  }
  watcher.subscribe(signal, listener)
}

/** @param {Document} document @param {string} roomId @param {() => void} onStop */
function createWatcher(document, roomId, onStop) {
  const win = document.defaultView
  if (!win) throw new Error('Danmaku watcher requires a window')
  const browser = win
  /** @type {Set<(snapshot: Snapshot) => void>} */
  const listeners = new Set()
  /** @type {WeakMap<Element, Danmaku>} */
  const observed = new WeakMap()
  let sequence = 0
  /** @type {Element | null} */
  let list = null
  /** @type {number | undefined} */
  let updateId

  /** @returns {Snapshot} */
  function read() {
    list = document.querySelector(listSelector)
    if (!list) return { available: false, entries: [] }
    const rows = list.querySelectorAll(rowSelector)
    /** @type {Entry[]} */
    const entries = []
    for (let index = Math.max(0, rows.length - maxRows); index < rows.length; index += 1) {
      const node = rows[index]
      const content = readDanmakuRow(node)
      if (!content) {
        observed.delete(node)
        continue
      }
      const previousRoom = rowRooms.get(node)
      if (previousRoom && previousRoom.roomId !== roomId &&
        previousRoom.author === content.author && previousRoom.text === content.text) continue
      rowRooms.set(node, { roomId, ...content })
      let message = observed.get(node)
      if (!message || message.author !== content.author || message.text !== content.text) {
        message = { id: String(++sequence), roomId, ...content, timestamp: Date.now(), kind: 'text', source: 'visible-dom' }
        observed.set(node, message)
      }
      entries.push({ node, message })
    }
    return { available: true, entries }
  }

  const observer = new win.MutationObserver((records) => {
    if (updateId !== undefined || (list?.isConnected && !records.some(({ target }) => list?.contains(target)))) return
    updateId = browser.setTimeout(() => {
      updateId = undefined
      const snapshot = read()
      for (const listener of listeners) listener(snapshot)
    }, 32)
  })
  observer.observe(document.body, {
    childList: true, characterData: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'alt'],
  })

  return {
    /** @param {AbortSignal} signal @param {(snapshot: Snapshot) => void} listener */
    subscribe(signal, listener) {
      listeners.add(listener)
      signal.addEventListener('abort', () => {
        listeners.delete(listener)
        if (listeners.size) return
        observer.disconnect()
        browser.clearTimeout(updateId)
        onStop()
      }, { once: true })
      listener(read())
    },
  }
}
