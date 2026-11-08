/** @param {Location} location @returns {import('../../core/types.js').Route | null} */
export function readRoute(location) {
  if (location.origin !== 'https://live.douyin.com') return null

  const path = location.pathname.replace(/\/$/, '')
  if (path === '') return { kind: 'portal', key: '/' }
  if (/^\/\d+$/.test(path)) return { kind: 'room', key: path }
  return null
}
