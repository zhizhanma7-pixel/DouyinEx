import { startApp } from './core/app.js'
import { features } from './features/registry.js'

const runtimeKey = Symbol.for('douyinex:running')
if (!Reflect.get(window, runtimeKey)) {
  startApp(window, {
    getValue: GM_getValue,
    setValue: GM_setValue,
    registerMenuCommand: GM_registerMenuCommand,
    unregisterMenuCommand: GM_unregisterMenuCommand,
  }, features)
  Reflect.set(window, runtimeKey, true)
}
