export const panelStyles = `
  :host {
    all: initial;
    position: fixed;
    inset-inline-end: var(--douyinex-inline-end, 18px);
    inset-block-end: var(--douyinex-block-end, 18px);
    z-index: 10000;
    display: grid;
    justify-items: end;
    gap: 10px;
    max-inline-size: calc(100vw - 36px);
    color-scheme: dark;
    font: 14px/1.45 system-ui, "Microsoft YaHei", sans-serif;
    color: #f3f5fa;
  }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, select, textarea { font: inherit; }
  button, summary, label:has(input:enabled) { cursor: pointer; }
  :focus-visible { outline: 2px solid #83f5dc; outline-offset: 3px; }
  .trigger {
    display: flex;
    align-items: center;
    gap: 9px;
    min-block-size: 44px;
    padding: 6px 14px 6px 7px;
    border: 1px solid #47625e;
    border-radius: 999px;
    background: #171e29;
    color: #f3f5fa;
    box-shadow: 0 5px 18px #0007;
    font-weight: 650;
  }
  .mark {
    display: grid;
    place-items: center;
    inline-size: 29px;
    block-size: 29px;
    border-radius: 50%;
    background: #83f5dc;
    color: #102721;
    font-size: 11px;
    letter-spacing: .04em;
  }
  .panel {
    inline-size: min(360px, calc(100vw - 36px));
    max-block-size: min(75vh, calc(100vh - var(--douyinex-block-end, 18px) - 74px));
    overflow: auto;
    overscroll-behavior: contain;
    padding: 15px;
    border: 1px solid #394452;
    border-radius: 18px;
    background: #161c27;
    box-shadow: 0 12px 40px #0007;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-block-end: 8px;
  }
  .header h2 { margin: 0; font-size: 18px; }
  .subtitle { margin: 2px 0 0; font-size: 12px; color: #b6c2d0; }
  .close, .actions button {
    min-block-size: 32px;
    border: 1px solid #475568;
    border-radius: 8px;
    background: #222c3b;
    color: #f3f5fa;
  }
  .close { flex: 0 0 34px; padding: 0; font-size: 19px; }
  .group { margin: 8px 0 0; padding: 0; border: 0; min-inline-size: 0; }
  .group legend { padding: 0; font-size: 12px; color: #c0cddd; }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 6px;
    min-block-size: 36px;
    padding: 5px 8px;
    border-radius: 8px;
    background: #202938;
  }
  .row + .row { margin-block-start: 4px; }
  .row label { display: flex; align-items: center; gap: 5px; min-block-size: 26px; }
  .row input { flex: none; inline-size: 16px; block-size: 16px; accent-color: #83f5dc; }
  .badge { padding: 1px 6px; border-radius: 999px; font-size: 11px; color: #c5cfdb; background: #303b4e; }
  .badge[data-state="supported"] { color: #a7f3dc; background: #233f3a; }
  .badge[data-state="needs-test"] { color: #ffe1a0; background: #493920; }
  .detail { grid-column: 1 / -1; margin: 0 0 2px 26px; font-size: 12px; color: #bfe2dc; }
  .detail textarea { display: block; inline-size: 100%; resize: vertical; }
  .transfer { margin-block-start: 8px; }
  .transfer summary { font-size: 13px; color: #aeeadb; }
  .transfer label { display: block; margin-block: 8px 4px; font-size: 12px; }
  .transfer textarea {
    display: block;
    inline-size: 100%;
    min-block-size: 80px;
    padding: 7px;
    border: 1px solid #475568;
    border-radius: 8px;
    background: #101622;
    color: #f3f5fa;
    resize: vertical;
  }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-block-start: 7px; }
  .actions button { padding: 4px 8px; font-size: 12px; }
  .layout-actions { align-items: center; justify-content: space-between; margin-block: 4px; }
  .player-actions { align-items: center; }
  .player-actions select { max-inline-size: 100%; padding: 4px; border-radius: 6px; }
  .player-actions button[aria-pressed="true"] { border-color: #83f5dc; }
  .feedback { margin: 0; color: #ffe1a0; font-size: 12px; }
  .feedback:not(:empty) { margin-block-start: 8px; }
  :host([data-compact]) .panel { inline-size: min(300px, calc(100vw - 36px)); padding: 10px; }
  :host([data-compact]) .group { margin-block-start: 4px; }
  :host([data-compact]) .row { min-block-size: 30px; padding-block: 2px; }
  @media (max-width: 480px) {
    :host { inset-inline-end: 10px; inset-block-end: 10px; max-inline-size: calc(100vw - 20px); }
    .panel { inline-size: min(360px, calc(100vw - 20px)); }
  }
`
