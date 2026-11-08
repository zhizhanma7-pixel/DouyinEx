const origin = 'https://live.douyin.com'

/** @param {string} input */
export function parseRoomUrl(input) {
  const value = input.trim()
  if (/^\d{1,20}$/.test(value)) return new URL(`/${value}`, origin)
  try {
    const url = new URL(value)
    if (url.origin !== origin || url.username || url.password || !/^\/\d{1,20}\/?$/.test(url.pathname)) return null
    return new URL(url.pathname.replace(/\/$/, ''), origin)
  } catch {
    return null
  }
}
