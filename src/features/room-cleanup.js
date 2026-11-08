import { mountRoomStyle } from '../adapters/douyin/room-layout.js'
import { roomStyleRules } from '../adapters/douyin/room-layout-selectors.js'

/** @type {import('../core/types.js').Feature[]} */
export const roomCleanup = Object.entries(roomStyleRules).map(([id, { label }]) => ({
  id,
  label,
  section: 'cleanup',
  scope: 'room',
  defaultEnabled: false,
  capabilities: (route) => route.kind === 'room' ? 'supported' : 'unsupported',
  mount: ({ document, view }) => mountRoomStyle(document, id, view.detail),
}))
