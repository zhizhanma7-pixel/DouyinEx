// Fixed tiers observed in the native menu, ordered low to high.
const tiers = ['标清', '高清', '超清', '蓝光', '原画']
const locked = /登录|会员|付费|开通|解锁|权限|订阅|sign\s*in|log\s*in|premium|locked/i
const disabled = '[disabled],[aria-disabled="true"],[data-disabled="true"],[inert]'
export const QUALITY_CONFIRM_TIMEOUT = 2500

/** @param {string} label */
export function qualityRank(label) {
  return tiers.indexOf(label)
}

/** @param {HTMLElement} node */
function explicitlyHidden(node) {
  return node.hidden || node.style.display === 'none' || node.style.visibility === 'hidden'
}

/** @param {HTMLElement} node @param {HTMLElement} row */
function hiddenWithinRow(node, row) {
  /** @type {HTMLElement | null} */
  let current = node
  while (current && current !== row) {
    if (explicitlyHidden(current)) return true
    current = current.parentElement
  }
  return false
}

/** @param {HTMLElement} stage */
export function readQuality(stage) {
  const trigger = stage.querySelector('[data-e2e="quality"]')
  const current = trigger?.textContent.trim() ?? ''
  const menu = trigger?.parentElement?.querySelector('[data-e2e="quality-selector"]')
  const win = stage.ownerDocument.defaultView
  /** @type {Map<string, HTMLElement>} */
  const options = new Map()
  const ambiguous = new Set()
  if (win && menu && !menu.closest(disabled)) {
    for (const row of menu.children) {
      if (!(row instanceof win.HTMLElement) || explicitlyHidden(row) ||
        row.getAttribute('aria-hidden') === 'true' || row.matches(disabled) || row.querySelector(disabled)) continue
      const nodes = [row, ...row.querySelectorAll('*')]
      // Unauthenticated playback refused upgrades even when this access hint was visually hidden.
      if (locked.test(row.textContent) || nodes.some((node) =>
        locked.test(node.getAttribute('aria-label') ?? '') || locked.test(node.getAttribute('title') ?? ''))) continue
      const known = nodes.filter((node) => node instanceof win.HTMLElement && !node.children.length &&
        !hiddenWithinRow(node, row) && qualityRank(node.textContent.trim()) >= 0)
      if (known.length !== 1 || !(known[0] instanceof win.HTMLElement)) continue
      const label = known[0].textContent.trim()
      if (options.has(label)) ambiguous.add(label)
      options.set(label, known[0])
    }
  }
  for (const label of ambiguous) options.delete(label)
  return { current: qualityRank(current) >= 0 ? current : '', options }
}
