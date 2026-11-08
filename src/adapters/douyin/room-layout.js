import { protectedRoomContent, ROOM_LAYOUT_VERSION, roomLayoutRoot, roomStyleRules } from './room-layout-selectors.js'

const marker = `data-douyinex-layout-v${ROOM_LAYOUT_VERSION}`
const css = Object.entries(roomStyleRules)
  .map(([id, { selector, css }]) => `[${marker}~="${id}"]:is(${selector}) { ${css} }`).join('\n')

/** @type {WeakMap<Document, ReturnType<typeof createLayoutSession>>} */
const sessions = new WeakMap()

/** @param {Document} document @param {string} id @param {HTMLElement} detail */
export function mountRoomStyle(document, id, detail) {
  let session = sessions.get(document)
  if (!session) {
    session = createLayoutSession(document)
    sessions.set(document, session)
  }
  return session.mount(id, detail)
}

/** @param {Document} document */
function createLayoutSession(document) {
  const win = document.defaultView
  if (!win) throw new Error('Room layout requires a window')
  const browser = win
  const removeStyle = installDocumentStyle(document, css)
  /** @type {Map<string, HTMLElement>} */
  const active = new Map()
  /** @type {Map<Element, string[]>} */
  let marked = new Map()
  let candidates = `[${marker}]`
  let decorativeCandidates = ''
  const observer = new browser.MutationObserver((records) => {
    if (records.some(affectsLayout)) refresh()
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'id', 'class', 'data-e2e', 'role', 'aria-modal', 'aria-label',
      'href', 'tabindex', 'contenteditable',
    ],
  })

  /** @param {MutationRecord} record */
  function affectsLayout(record) {
    const { target } = record
    if (target instanceof browser.Element) {
      if (decorativeCandidates && target.closest(decorativeCandidates)) return true
      if (record.type === 'attributes') {
        return target.matches(`${candidates},${roomLayoutRoot}`)
          || ((record.attributeName === 'data-e2e' || target.matches(protectedRoomContent))
            && Boolean(target.querySelector(`[${marker}]`)))
      }
    }
    for (const nodes of [record.addedNodes, record.removedNodes]) {
      for (const node of nodes) {
        if (node instanceof browser.Element &&
          (node.matches(candidates) || node.querySelector(candidates))) return true
      }
    }
    return false
  }

  function refreshSubscriptions() {
    const rules = [...active.keys()].map((id) => roomStyleRules[id])
    candidates = [`[${marker}]`, ...rules.map(({ selector }) => selector)].join(',')
    decorativeCandidates = rules
      .filter(({ decorativeOnly }) => decorativeOnly).map(({ selector }) => selector).join(',')
    refresh()
  }

  function refresh() {
    /** @type {Map<Element, string[]>} */
    const next = new Map()
    const root = document.querySelector(roomLayoutRoot)
    for (const [id, detail] of active) {
      const rule = roomStyleRules[id]
      let matched = false
      for (const node of root?.querySelectorAll(rule.selector) ?? []) {
        if (rule.decorativeOnly &&
          (node.closest(protectedRoomContent) || node.querySelector(protectedRoomContent))) continue
        const flags = next.get(node) ?? []
        flags.push(id)
        next.set(node, flags)
        matched = true
      }
      const status = matched ? '' : '当前布局没有可安全处理的元素。'
      if (detail.textContent !== status) detail.textContent = status
      detail.hidden = matched
    }
    for (const node of marked.keys()) {
      if (!next.has(node)) node.removeAttribute(marker)
    }
    for (const [node, flags] of next) {
      const value = flags.join(' ')
      if (node.getAttribute(marker) !== value) node.setAttribute(marker, value)
    }
    marked = next
  }

  return {
    /** @param {string} id @param {HTMLElement} detail */
    mount(id, detail) {
      active.set(id, detail)
      refreshSubscriptions()
      return {
        dispose() {
          active.delete(id)
          detail.hidden = true
          detail.textContent = ''
          refreshSubscriptions()
          if (active.size === 0) {
            observer.disconnect()
            removeStyle()
            sessions.delete(document)
          }
        },
      }
    },
  }
}

import { installDocumentStyle } from '../../core/document-style.js'
