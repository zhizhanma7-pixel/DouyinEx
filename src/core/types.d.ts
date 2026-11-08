export type ScriptApi = {
  getValue(key: string, defaultValue: boolean): unknown
  setValue(key: string, value: boolean): void
  registerMenuCommand(label: string, callback: () => void): number | string
  unregisterMenuCommand(id: number | string): void
}

export type Route = {
  kind: 'portal' | 'room'
  key: string
}

export type Feature = {
  route: Route['kind']
  mount(context: {
    document: Document
    route: Route
    signal: AbortSignal
  }): void | (() => void)
}

export type ErrorCode = 'settings-read' | 'settings-write' | 'feature-mount' | 'feature-cleanup'

declare global {
  const GM_getValue: ScriptApi['getValue']
  const GM_setValue: ScriptApi['setValue']
  const GM_registerMenuCommand: ScriptApi['registerMenuCommand']
  const GM_unregisterMenuCommand: ScriptApi['unregisterMenuCommand']
  interface Window {
    onurlchange?: unknown
  }
}
