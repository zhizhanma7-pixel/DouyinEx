export type ScriptApi = {
  getValue(key: string, defaultValue: boolean | null): unknown
  setValue(key: string, value: boolean | PreferencesFile): void
  registerMenuCommand(label: string, callback: () => void): number | string
  unregisterMenuCommand(id: number | string): void
}

export type Route = {
  kind: 'portal' | 'room'
  key: string
}

export type Section = 'playback' | 'danmaku' | 'cleanup' | 'multimedia' | 'advanced' | 'diagnostics'
export type Availability = 'supported' | 'unsupported' | 'needs-test'
export type Preferences = Record<string, boolean>
export type PreferencesFile = { version: 1; features: Preferences }

export type Feature = {
  id: string
  label: string
  section: Section
  scope?: 'room'
  defaultEnabled: boolean
  capabilities(route: Route): Availability
  mount?(context: {
    document: Document
    route: Route
    signal: AbortSignal
    view: { host: HTMLElement; detail: HTMLElement }
  }): void | { dispose(): void }
}

export type FeatureState = {
  availability: Availability
  enabled: boolean
  failed: boolean
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
