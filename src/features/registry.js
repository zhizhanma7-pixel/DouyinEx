import { mountDanmakuExport } from './danmaku-export.js'
import { mountDanmakuFilters } from './danmaku-filters.js'
import { mountHighestQuality } from './highest-quality.js'
import { mountMediaCapture } from './media-capture.js'
import { mountMultiview } from './multiview.js'
import { mountPictureInPicture } from './picture-in-picture.js'
import { mountPlayerControls } from './player-controls.js'
import { mountPauseGuard, mountVolumeWheel } from './player-gestures.js'
import { roomCleanup } from './room-cleanup.js'
import { videoDiagnostics } from './video-diagnostics.js'

/** @param {import('../core/types.js').Route} route */
const roomOnly = (route) => route.kind === 'room' ? 'supported' : 'unsupported'

/** @type {readonly import('../core/types.js').Feature[]} */
export const features = [
  {
    id: 'player-controls', label: '播放器快捷控制', section: 'playback',
    defaultEnabled: false, capabilities: roomOnly, mount: mountPlayerControls,
  },
  {
    id: 'highest-quality', label: '优先最高可用画质', section: 'playback',
    defaultEnabled: false, capabilities: roomOnly, mount: mountHighestQuality,
  },
  {
    id: 'volume-wheel', label: '播放器滚轮音量', section: 'playback',
    defaultEnabled: false, capabilities: roomOnly, mount: ({ document, signal }) => mountVolumeWheel(document, signal),
  },
  {
    id: 'pause-guard', label: '防误暂停', section: 'playback',
    defaultEnabled: false, capabilities: roomOnly, mount: ({ document, signal }) => mountPauseGuard(document, signal),
  },
  {
    id: 'danmaku-filters', label: '弹幕过滤', section: 'danmaku',
    defaultEnabled: false, capabilities: roomOnly, mount: mountDanmakuFilters,
  },
  ...roomCleanup,
  {
    id: 'picture-in-picture', label: '画中画', section: 'multimedia',
    defaultEnabled: false, capabilities: roomOnly, mount: mountPictureInPicture,
  },
  {
    id: 'multiview', label: '双房间视图', section: 'multimedia',
    defaultEnabled: false, capabilities: () => 'supported', mount: mountMultiview,
  },
  {
    id: 'capture', label: '截图与录制', section: 'multimedia',
    defaultEnabled: false, capabilities: roomOnly, mount: mountMediaCapture,
  },
  {
    id: 'danmaku-export', label: '观察与导出弹幕', section: 'multimedia',
    defaultEnabled: false, capabilities: roomOnly, mount: mountDanmakuExport,
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
