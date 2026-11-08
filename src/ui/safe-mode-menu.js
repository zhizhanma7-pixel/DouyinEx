/**
 * @param {import('../core/types.js').ScriptApi} api
 * @param {() => boolean} isEnabled
 * @param {() => boolean} toggle
 */
export function createSafeModeMenu(api, isEnabled, toggle) {
  /** @type {number | string | undefined} */
  let id

  function remove() {
    if (id === undefined) return
    api.unregisterMenuCommand(id)
    id = undefined
  }

  function show() {
    remove()
    const label = isEnabled() ? '关闭安全模式' : '开启安全模式'
    id = api.registerMenuCommand(`DouyinEx · ${label}`, () => {
      if (toggle()) show()
    })
  }

  return { show, remove }
}
