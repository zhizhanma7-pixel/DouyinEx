import { videoDiagnostics } from './video-diagnostics.js'

/** @type {readonly import('../core/types.js').Feature[]} */
export const features = [
  {
    id: 'player-controls', label: '播放器快捷控制', section: 'playback',
    defaultEnabled: false, capabilities: () => 'needs-test',
  },
  {
    id: 'danmaku-filters', label: '弹幕过滤', section: 'danmaku',
    defaultEnabled: false, capabilities: () => 'needs-test',
  },
  {
    id: 'page-cleanup', label: '隐藏页面杂项', section: 'cleanup',
    defaultEnabled: false, capabilities: () => 'unsupported',
  },
  {
    id: 'capture', label: '截图与录制', section: 'multimedia',
    defaultEnabled: false, capabilities: () => 'unsupported',
  },
  {
    id: 'compact-panel', label: '紧凑面板', section: 'advanced',
    defaultEnabled: false, capabilities: () => 'supported',
    mount({ view }) {
      view.host.setAttribute('data-compact', '')
      return { dispose: () => view.host.removeAttribute('data-compact') }
    },
  },
  videoDiagnostics,
]
