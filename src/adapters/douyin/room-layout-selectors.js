// Version 1 is based on the public Douyin live-room DOM observed on 2026-11-08.
export const ROOM_LAYOUT_VERSION = 1
export const roomLayoutRoot = '[data-e2e="living-container"]'

export const protectedRoomContent = [
  'video', 'audio', 'iframe', 'form', 'button', 'a[href]', 'input', 'textarea', 'select',
  'details', 'dialog', '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
  '[role="button"]', '[role="link"]', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"])',
  '#PlayerControlLayout', '#GiftMenuLayout', '#chatroom',
  '[data-e2e="live-followbutton"]', '[data-e2e="recharge-btn"]', '[data-e2e="gifts-switch"]',
  '[data-e2e*="login" i]', '[data-e2e*="account" i]', '[data-e2e*="report" i]',
  '[data-e2e*="pay" i]', '[data-e2e*="safety" i]',
  '[aria-label*="举报"]', '[aria-label*="充值"]', '[aria-label*="登录"]',
].join(',')

/** @type {Record<string, { label: string; selector: string; css: string; decorativeOnly?: boolean }>} */
export const roomStyleRules = {
  'hide-promotions': {
    label: '隐藏展馆推广横幅',
    selector: '#room_info_bar [data-e2e="exhibition-banner"]',
    css: 'display: none !important;',
    decorativeOnly: true,
  },
  'hide-gift-strip': {
    label: '隐藏礼物选项栏',
    selector: '[data-e2e="gifts-container"]',
    css: 'display: none !important;',
    decorativeOnly: true,
  },
  'hide-gift-overlays': {
    label: '隐藏礼物特效和飘条',
    selector: '#GiftEffectLayout, #GiftTrayLayout .GiftTrayPlugin',
    css: 'visibility: hidden !important;',
    decorativeOnly: true,
  },
  'simple-layout': {
    label: '简洁布局',
    selector: '#LeftBackgroundLayout > .douyin-player-dynamic-background',
    css: 'visibility: hidden !important;',
    decorativeOnly: true,
  },
  'theater-layout': {
    label: '影院布局',
    selector: '#LeftBackgroundLayout > .douyin-player-dynamic-background',
    css: 'filter: brightness(.18) !important;',
    decorativeOnly: true,
  },
  'dark-layout': {
    label: '深色布局',
    selector: '#ContainerBackgroundLayout, #RightBackgroundLayout',
    css: 'background-color: #11141b !important;',
  },
}
