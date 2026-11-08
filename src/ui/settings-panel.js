import { MAX_PREFERENCES_LENGTH } from '../core/settings.js'
import { panelStyles } from './panel-style.js'

/** @type {Record<import('../core/types.js').Section, string>} */
const sections = {
  playback: '播放',
  danmaku: '弹幕',
  cleanup: '页面清理',
  multimedia: '多媒体',
  advanced: '高级',
  diagnostics: '诊断',
}
const availabilityLabels = {
  supported: '可用',
  unsupported: '暂不支持',
  'needs-test': '待实测',
}

/**
 * @param {Document} document
 * @param {readonly import('../core/types.js').Feature[]} features
 * @param {{
 *   setFeature(id: string, enabled: boolean): boolean
 *   exportPreferences(): string
 *   importPreferences(text: string): string
 *   resetPreferences(): boolean
 *   restoreRoomLayout(): boolean
 * }} actions
 */
export function createSettingsPanel(document, features, actions) {
  /**
   * @template {keyof HTMLElementTagNameMap} Tag
   * @param {Tag} tag
   * @param {string} [text]
   * @param {string} [className]
   */
  function element(tag, text = '', className = '') {
    const node = document.createElement(tag)
    if (text) node.textContent = text
    if (className) node.className = className
    return node
  }

  /** @param {string} label @param {() => void} click @param {string} [className] */
  function button(label, click, className) {
    const node = element('button', label, className)
    node.type = 'button'
    node.addEventListener('click', click)
    return node
  }

  const host = document.createElement('douyinex-settings')
  host.lang = 'zh-CN'
  const root = host.attachShadow({ mode: 'open' })
  const Sheet = document.defaultView?.CSSStyleSheet
  if (Sheet && typeof Sheet.prototype.replaceSync === 'function' && 'adoptedStyleSheets' in root) {
    const sheet = new Sheet()
    sheet.replaceSync(panelStyles)
    root.adoptedStyleSheets = [sheet]
  } else {
    root.append(element('style', panelStyles))
  }

  const panel = element('section', '', 'panel')
  panel.id = 'douyinex-panel'
  panel.hidden = true
  panel.setAttribute('aria-labelledby', 'douyinex-title')
  const title = element('h2', 'DouyinEx 设置')
  title.id = 'douyinex-title'
  title.tabIndex = -1
  const trigger = button('', () => setOpen(panel.hidden), 'trigger')
  const mark = element('span', 'DX', 'mark')
  mark.setAttribute('aria-hidden', 'true')
  trigger.append(mark, element('span', 'DouyinEx'))
  trigger.setAttribute('aria-label', 'DouyinEx 设置')
  trigger.setAttribute('aria-controls', panel.id)
  trigger.setAttribute('aria-expanded', 'false')
  const close = button('×', () => setOpen(false), 'close')
  close.setAttribute('aria-label', '关闭 DouyinEx 设置')
  const heading = element('div')
  heading.append(title, element('p', '抖音直播 · 本地偏好', 'subtitle'))
  const header = element('div', '', 'header')
  header.append(heading, close)
  const feedback = element('p', '', 'feedback')
  feedback.setAttribute('role', 'status')
  panel.append(header, feedback)

  const transfer = element('details', '', 'transfer')
  const inputLabel = element('label', '偏好 JSON')
  inputLabel.htmlFor = 'douyinex-preferences'
  const preferences = element('textarea')
  preferences.id = inputLabel.htmlFor
  preferences.rows = 4
  preferences.maxLength = MAX_PREFERENCES_LENGTH
  preferences.spellcheck = false
  const transferActions = element('div', '', 'actions')
  transferActions.append(
    button('导出', () => {
      preferences.value = actions.exportPreferences()
      preferences.focus()
      preferences.select()
      feedback.textContent = '已导出到文本框，可以复制。'
    }),
    button('导入', () => { feedback.textContent = actions.importPreferences(preferences.value) }),
    button('恢复默认', () => {
      if (!actions.resetPreferences()) {
        feedback.textContent = '无法保存设置，请重试。'
        return
      }
      preferences.value = ''
      feedback.textContent = '已恢复默认设置。'
    }),
  )
  transfer.append(element('summary', '导入、导出与恢复'), inputLabel, preferences, transferActions)

  const layoutActions = element('div', '', 'actions layout-actions')
  layoutActions.hidden = true
  layoutActions.append(
    element('p', '清理设置仅应用于当前直播间。', 'subtitle'),
    button('恢复原始布局', () => {
      feedback.textContent = actions.restoreRoomLayout()
        ? '已恢复当前直播间的原始布局。'
        : '无法保存设置，请重试。'
    }),
  )

  /** @type {Map<string, { input: HTMLInputElement; badge: HTMLElement; detail: HTMLElement }>} */
  const rows = new Map()
  for (const [section, label] of Object.entries(sections)) {
    const group = element('fieldset', '', 'group')
    group.append(element('legend', label))
    if (section === 'cleanup') group.append(layoutActions)
    for (const feature of features) {
      if (feature.section !== section) continue
      const row = element('div', '', 'row')
      const label = element('label')
      const input = element('input')
      input.type = 'checkbox'
      input.disabled = true
      const badge = element('span', '', 'badge')
      badge.id = `douyinex-availability-${feature.id}`
      input.setAttribute('aria-describedby', badge.id)
      const detail = element('p', '', 'detail')
      detail.hidden = true
      input.addEventListener('change', () => {
        if (actions.setFeature(feature.id, input.checked)) {
          feedback.textContent = ''
        } else {
          input.checked = !input.checked
          feedback.textContent = '无法保存设置，请重试。'
        }
      })
      label.append(input, document.createTextNode(feature.label))
      row.append(label, badge, detail)
      group.append(row)
      rows.set(feature.id, { input, badge, detail })
    }
    if (section === 'advanced') group.append(transfer)
    panel.append(group)
  }

  /** @param {boolean} open */
  function setOpen(open) {
    panel.hidden = !open
    trigger.setAttribute('aria-expanded', String(open))
    const target = open ? title : trigger
    target.focus()
  }

  root.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if ('key' in event && event.key === 'Escape' && !panel.hidden) {
      event.preventDefault()
      setOpen(false)
    }
  })
  root.addEventListener('keyup', (event) => event.stopPropagation())
  root.append(panel, trigger)
  document.body.append(host)

  return {
    host,
    /** @param {string} id */
    getView(id) {
      const row = rows.get(id)
      if (!row) throw new Error('Missing settings row')
      return { host, detail: row.detail }
    },
    /**
     * @param {Map<string, import('../core/types.js').FeatureState>} states
     * @param {boolean} inRoom
     */
    update(states, inRoom) {
      layoutActions.hidden = !inRoom
      for (const [id, row] of rows) {
        const state = states.get(id)
        if (!state) continue
        row.input.disabled = state.availability !== 'supported'
        row.input.checked = state.enabled
        row.badge.dataset.state = state.failed ? 'needs-test' : state.availability
        row.badge.textContent = state.failed ? '启动失败' : availabilityLabels[state.availability]
      }
    },
    remove() { host.remove() },
  }
}
