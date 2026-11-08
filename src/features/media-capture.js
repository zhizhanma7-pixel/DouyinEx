import { findActivePlayer, watchPlayer } from '../adapters/douyin/player.js'
import { readRoute } from '../adapters/douyin/route.js'
import { actionButton } from '../ui/dom.js'
import { createLocalDownload } from '../ui/local-download.js'

const clipDuration = 10000
const clipLimit = 16 * 1024 * 1024
const types = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']

/** @typedef {HTMLVideoElement & {captureStream?: () => MediaStream}} CapturableVideo */
/** @typedef {{recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; size: number; timer: number; stopping: boolean}} Recording */

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountMediaCapture({ document, route, signal, view }) {
  const win = document.defaultView
  if (!win) return
  const browser = win
  const protectedVideos = new WeakSet()
  const download = createLocalDownload(document)
  /** @type {CapturableVideo | null} */
  let video = null
  /** @type {Recording | null} */
  let recording = null
  let imageRequest = 0
  let preparingImage = false
  let message = ''
  const label = document.createElement('label')
  const permission = document.createElement('input')
  permission.type = 'checkbox'
  label.append(permission, document.createTextNode('我有权保存当前视频内容'))
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  const screenshot = actionButton(document, '生成 PNG 截图', takeScreenshot)
  const record = actionButton(document, '录制最多 10 秒', () => {
    if (recording) stopRecording()
    else startRecording()
  })
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(screenshot, record, download.link)
  view.detail.append(label, actions, status)
  view.detail.hidden = false

  permission.addEventListener('change', () => {
    message = ''
    if (!permission.checked) clearCapture()
    render()
  }, { signal })
  document.addEventListener('encrypted', (event) => {
    if (!(event.target instanceof browser.HTMLVideoElement)) return
    protectedVideos.add(event.target)
    if (video === event.target) {
      clearCapture()
      message = ''
      render()
    }
  }, { capture: true, signal })
  for (const event of ['loadstart', 'emptied']) {
    document.addEventListener(event, ({ target }) => {
      if (!video || target !== video) return
      permission.checked = false
      clearCapture()
      message = ''
      render()
    }, { capture: true, signal })
  }
  watchPlayer(document, signal, (player) => {
    const next = player?.video ?? null
    if (video !== next) {
      permission.checked = false
      clearCapture()
      message = ''
    }
    video = next
    if (recording && !ready()) {
      discardRecording()
      message = '视频源发生变化，已停止录制。'
    }
    render()
  })

  function ready() {
    return Boolean(video && video.readyState >= 2 && video.videoWidth && video.videoHeight && !video.error &&
      !video.mediaKeys && !protectedVideos.has(video))
  }

  function mimeType() {
    if (typeof video?.captureStream !== 'function' || !browser.MediaRecorder?.isTypeSupported) return ''
    return types.find((type) => browser.MediaRecorder.isTypeSupported(type)) ?? ''
  }

  function render() {
    const allowed = permission.checked && ready()
    screenshot.disabled = !allowed || preparingImage || Boolean(recording)
    record.disabled = recording ? recording.stopping : !allowed || preparingImage || !mimeType()
    record.textContent = recording ? '停止并生成片段' : '录制最多 10 秒'
    status.textContent = message || (!ready() ? '当前视频帧不可用或受保护。'
      : !permission.checked ? '确认有权保存后可使用浏览器提供的功能。'
        : !mimeType() ? '浏览器未提供可用的 WebM 录制能力。' : '')
  }

  function clearCapture() {
    imageRequest += 1
    preparingImage = false
    discardRecording()
    download.clear()
  }

  /** @param {HTMLVideoElement} target */
  function stillActive(target) {
    return !signal.aborted && permission.checked && ready() &&
      readRoute(browser.location)?.key === route.key && findActivePlayer(document)?.video === target
  }

  function takeScreenshot() {
    if (!video || !stillActive(video) || preparingImage || recording) return
    const target = video
    const request = ++imageRequest
    preparingImage = true
    message = '正在生成截图。'
    render()
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 3840 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (signal.aborted || request !== imageRequest) return
        preparingImage = false
        message = blob && stillActive(target) && download.prepare(blob, 'frame', 'png')
          ? '截图已就绪。' : '浏览器无法生成截图文件。'
        render()
      }, 'image/png')
    } catch {
      preparingImage = false
      message = '浏览器拒绝读取视频帧，可能受跨域或媒体保护限制。'
      render()
    }
  }

  function startRecording() {
    if (!video || !stillActive(video) || preparingImage || recording) return
    const target = video
    const type = mimeType()
    if (!type || !video.captureStream) return
    /** @type {MediaStreamTrack[]} */
    const ownedTracks = []
    try {
      // Verify origin-clean access before asking the browser for capture tracks.
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(video, 0, 0, 1, 1)
      context.getImageData(0, 0, 1, 1)
      const captured = video.captureStream()
      const source = video.srcObject instanceof browser.MediaStream ? video.srcObject : null
      const sourceIds = new Set(source?.getTracks().map((track) => track.id))
      for (const track of captured.getTracks()) {
        // Chromium may expose another handle to the playback track with the same ID.
        ownedTracks.push(sourceIds.has(track.id) ? track.clone() : track)
      }
      const stream = new browser.MediaStream(ownedTracks)
      if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) throw new Error('No capture video')
      const recorder = new browser.MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2000000 })
      /** @type {Recording} */
      const job = { recorder, stream, chunks: [], size: 0, timer: 0, stopping: false }
      recording = job
      recorder.addEventListener('dataavailable', ({ data }) => {
        if (recording !== job || !data.size) return
        job.size += data.size
        if (job.size > clipLimit) {
          discardRecording()
          message = '片段超过 16 MiB，已停止录制。'
          render()
        } else job.chunks.push(data)
      })
      recorder.addEventListener('stop', () => {
        if (recording !== job) return
        const file = new Blob(job.chunks, { type: recorder.mimeType || type })
        discardRecording()
        message = file.size && stillActive(target) && download.prepare(file, 'clip', 'webm')
          ? '片段已就绪。' : '浏览器未生成可下载的片段。'
        render()
      }, { once: true })
      recorder.addEventListener('error', () => {
        if (recording !== job) return
        discardRecording()
        message = '浏览器停止了录制。'
        render()
      }, { once: true })
      recorder.start(250)
      job.timer = browser.setTimeout(stopRecording, clipDuration)
      message = '正在录制，最长 10 秒。'
    } catch {
      if (recording) discardRecording()
      else for (const track of ownedTracks) track.stop()
      message = '浏览器拒绝录制，可能受跨域、媒体保护或格式限制。'
    }
    render()
  }

  function stopRecording() {
    if (!recording || recording.stopping || recording.recorder.state === 'inactive') return
    recording.stopping = true
    browser.clearTimeout(recording.timer)
    try {
      recording.recorder.stop()
      message = '正在生成片段。'
    } catch {
      discardRecording()
      message = '浏览器无法结束录制。'
    }
    render()
  }

  function discardRecording() {
    const job = recording
    if (!job) return
    recording = null
    browser.clearTimeout(job.timer)
    try {
      if (job.recorder.state !== 'inactive') job.recorder.stop()
    } catch {
      // Stop the captured tracks even if the recorder has already failed.
    } finally {
      for (const track of job.stream.getTracks()) track.stop()
      job.chunks.length = 0
    }
  }

  return {
    dispose() {
      clearCapture()
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}
