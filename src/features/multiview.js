import { findActivePlayer, watchPlayer } from '../adapters/douyin/player.js'
import { parseRoomUrl } from '../adapters/douyin/room-url.js'
import { actionButton } from '../ui/dom.js'

const tileLimit = 2

/** @type {NonNullable<import('../core/types.js').Feature['mount']>} */
export function mountMultiview({ document, view }) {
  const win = document.defaultView
  if (!win || !view.host.shadowRoot) return
  const root = view.host.shadowRoot
  /** @type {(() => void) | null} */
  let close = null
  const opener = actionButton(document, '打开双房间视图', () => {
    if (close) return
    const board = createBoard(document, win, () => {
      close?.()
      close = null
      opener.focus()
    })
    close = board.remove
    const mainVideo = findActivePlayer(document)?.video
    if (mainVideo && !mainVideo.paused) mainVideo.pause()
    root.append(board.element)
    board.focus()
  })
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(opener)
  view.detail.append(actions)
  view.detail.hidden = false
  return {
    dispose() {
      close?.()
      close = null
      view.detail.replaceChildren()
      view.detail.hidden = true
    },
  }
}

/** @param {Document} document @param {Window & typeof globalThis} win @param {() => void} close */
function createBoard(document, win, close) {
  const scope = new win.AbortController()
  const element = document.createElement('section')
  element.className = 'multiview'
  element.setAttribute('aria-label', 'DouyinEx 双房间视图')
  const header = document.createElement('div')
  header.className = 'multiview-header'
  const title = document.createElement('h2')
  title.textContent = '双房间视图'
  const input = document.createElement('input')
  input.type = 'text'
  input.maxLength = 200
  input.placeholder = '房间号或网页链接'
  input.setAttribute('aria-label', '直播房间号或链接')
  const add = actionButton(document, '添加房间', addRoom)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) addRoom()
  }, { signal: scope.signal })
  const swap = actionButton(document, '交换位置', () => {
    if (tiles.length < 2) return
    tiles.reverse()
    refresh()
  })
  const done = actionButton(document, '关闭双房间视图', close)
  header.append(title, input, add, swap, done)
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  status.textContent = '最多两个房间，默认静音。离开标签页时暂停。'
  const grid = document.createElement('div')
  grid.className = 'multiview-grid'
  element.append(header, status, grid)
  /** @type {ReturnType<typeof createTile>[]} */
  const tiles = []
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }, { signal: scope.signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const tile of tiles) tile.pause()
  }, { signal: scope.signal })

  function refresh() {
    add.disabled = tiles.length >= tileLimit
    swap.disabled = tiles.length < 2
    tiles.forEach((tile, index) => { tile.element.style.order = String(index) })
  }

  function addRoom() {
    const url = parseRoomUrl(input.value)
    if (!url) {
      status.textContent = '请输入抖音网页版数字房间号或直播间链接。'
      return
    }
    if (tiles.some((tile) => tile.url.href === url.href)) {
      status.textContent = '这个房间已在视图中。'
      return
    }
    if (tiles.length >= tileLimit) return
    const tile = createTile(document, win, url, () => {
      tile.remove()
      tiles.splice(tiles.indexOf(tile), 1)
      refresh()
    }, () => {
      const next = !tile.audible()
      for (const other of tiles) if (other !== tile) other.setAudible(false)
      tile.setAudible(next)
    })
    tiles.push(tile)
    grid.append(tile.element)
    input.value = ''
    status.textContent = '已添加房间。播放器就绪后可手动播放。'
    refresh()
  }

  refresh()
  return {
    element,
    focus() { input.focus() },
    remove() {
      scope.abort()
      for (const tile of tiles) tile.remove()
      tiles.length = 0
      element.remove()
    },
  }
}

/**
 * @param {Document} document @param {Window & typeof globalThis} win
 * @param {URL} url @param {() => void} close @param {() => void} toggleAudio
 */
function createTile(document, win, url, close, toggleAudio) {
  const element = document.createElement('article')
  element.className = 'multiview-tile'
  const header = document.createElement('div')
  header.className = 'multiview-header'
  const title = document.createElement('strong')
  title.textContent = `房间 ${url.pathname.slice(1)}`
  const play = actionButton(document, '播放房间', () => { void togglePlayback() })
  const audio = actionButton(document, '打开房间声音', toggleAudio)
  const link = document.createElement('a')
  link.href = url.href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = '在新标签打开'
  const remove = actionButton(document, '关闭房间', close)
  header.append(title, play, audio, link, remove)
  const status = document.createElement('p')
  status.textContent = '正在加载房间。'
  status.setAttribute('role', 'status')
  const frame = document.createElement('iframe')
  frame.title = title.textContent
  frame.allow = "autoplay 'none'"
  frame.tabIndex = -1
  frame.style.pointerEvents = 'none'
  element.append(header, status, frame)
  /** @type {Document | null} */
  let child = null
  /** @type {AbortController | null} */
  let scope = null
  /** @type {HTMLVideoElement | null} */
  let video = null
  let audible = false
  let closed = false
  const timer = win.setTimeout(() => {
    bindFrame()
    if (!video) fail()
  }, 15000)
  frame.addEventListener('load', bindFrame)
  frame.src = url.href

  function mediaElements() {
    return /** @type {NodeListOf<HTMLMediaElement> | undefined} */ (child?.querySelectorAll('video,audio')) ?? []
  }

  function enforce() {
    for (const media of mediaElements()) {
      if (media !== video || !audible) {
        if (!media.muted) media.muted = true
      }
      if (document.hidden && !media.paused) media.pause()
    }
  }

  function refresh() {
    play.disabled = !video
    audio.disabled = !video
    play.textContent = video && !video.paused ? '暂停房间' : '播放房间'
    audio.textContent = audible ? '静音房间' : '打开房间声音'
    audio.setAttribute('aria-pressed', String(audible))
  }

  function bindFrame() {
    if (closed) return
    const next = frame.contentDocument
    if (!next || next.location?.origin !== url.origin || !next.defaultView) return
    if (next === child) return
    scope?.abort()
    child = next
    scope = new next.defaultView.AbortController()
    const signal = scope.signal
    for (const event of ['play', 'playing', 'volumechange']) {
      next.addEventListener(event, enforce, { capture: true, signal })
    }
    watchPlayer(next, signal, (player) => {
      if (video !== player?.video) audible = false
      video = player?.video ?? null
      enforce()
      refresh()
      if (video) {
        win.clearTimeout(timer)
        frame.style.pointerEvents = ''
        frame.tabIndex = 0
        status.textContent = '房间已载入。'
      }
    })
  }

  function pause() {
    for (const media of mediaElements()) if (!media.paused) media.pause()
    refresh()
  }

  function teardown() {
    closed = true
    win.clearTimeout(timer)
    audible = false
    enforce()
    pause()
    scope?.abort()
    video = null
    child = null
    frame.removeEventListener('load', bindFrame)
    frame.remove()
    refresh()
  }

  function fail() {
    teardown()
    status.textContent = '内嵌房间未就绪。可在新标签打开。'
  }

  async function togglePlayback() {
    if (!child || document.hidden) return
    const current = findActivePlayer(child)?.video
    if (!current) return
    if (!current.paused) current.pause()
    else {
      try {
        await current.play()
      } catch {
        status.textContent = '播放器拒绝播放。请使用房间原生按钮或在新标签打开。'
      }
    }
    refresh()
  }

  refresh()
  return {
    url,
    element,
    pause,
    audible: () => audible,
    /** @param {boolean} enabled */
    setAudible(enabled) {
      audible = enabled && Boolean(video)
      if (audible && video) video.muted = false
      enforce()
      refresh()
    },
    remove() {
      teardown()
      element.remove()
    },
  }
}
