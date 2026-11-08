# DouyinEx — Development Checkpoints

> Version: v0.2 · 2026-11-08 (Australia/Sydney)
>
> Status: **planning only**. This document defines implementation work and acceptance criteria; it does not imply that any feature has been developed or tested.

## 0. Mission / Scope

Build a modular **Tampermonkey userscript for Douyin web live rooms**. Use [DouyuEx](https://github.com/qianjiachun/douyuEx) as a **feature/UX reference**, not as an assumption that Douyu APIs or code can be directly reused. The goal is an experience-equivalent “DouyinEx” rather than a literal API-by-API clone.

**Principles**
- Browser-first. Do not build Electron/native client unless CP-00 proves browser playback unsuitable.
- Prefer the webpage's existing DOM, media elements and user interactions to private protocols.
- Features must be opt-in when they send messages, manipulate accounts, or consume resources.
- No hidden account actions, continuous spam, CAPTCHA bypass or unsupported signing workarounds.
- Do not copy third-party source code without confirming license and attribution obligations.
- Separate **verified behavior** from **assumptions**; keep reproducible test notes.
- Maintain feature flags and graceful degradation when Douyin changes its page.

## 1. Priority and status

Legend: `[ ]` not started · `[x]` verified complete. A checkpoint is **not complete** until its acceptance criteria are evidenced.

| CP | Priority | Dependencies | Deliverable | Status |
| --- | --- | --- | --- | --- |
| CP-00 | P0 / blocker | none | Browser live-room feasibility report | [ ] |
| CP-01 | P0 | CP-00 | Buildable minimal Tampermonkey skeleton | [ ] |
| CP-02 | P0 | CP-01 | DouyuEx-inspired settings panel | [ ] |
| CP-03 | P0 | CP-02 | Page cleanup and per-room settings | [ ] |
| CP-04 | P1 | CP-01 | Player enhancements | [ ] |
| CP-05 | P1 | CP-01, CP-02 | Danmaku adapter/filtering | [ ] |
| CP-05.1 | P1 | CP-05 | Manual +1 / copy-and-send | [ ] |
| CP-05.2 | P1 | CP-05 | Prefix/suffix “小尾巴” | [ ] |
| CP-06 | P1 | CP-04 | PiP / multiview | [ ] |
| CP-07 | P2 | CP-04 | Screenshot, recording, export | [ ] |
| CP-08 | P2–P3 | CP-05 | Live statistics and optional utilities | [ ] |
| CP-09 | P0 release gate | all enabled features | Security, compatibility, release | [ ] |

## 2. Work breakdown and acceptance

### CP-00 — Verify whether Douyin forces desktop client

**Question:** Can representative Douyin live rooms be viewed and interacted with in a standard desktop browser, including from Australia? A working website landing page **does not** prove individual live streams play.

Tasks:
- [ ] Open `https://live.douyin.com/` and at least 3 **actual room URLs** in current Chrome and Edge. Record browser version, date, IP region (only country/region, no personal address), login state, room type and URL.
- [ ] Test signed-in and signed-out sessions when possible. Confirm playback for 10+ minutes per representative room, including audio, auto-pause, full-screen, quality choice and chat-input availability.
- [ ] Record exactly when it requests installation/client handoff, if observed: user action, room, banner text/screenshot and whether browser playback is still available.
- [ ] Check one realistic overseas-network session; do not infer geo-policy from a failed request.
- [ ] Document which features are inherently app-only or privileged versus web-supported.
- [ ] Record DOM/video observations and console errors **without exposing cookies, tokens or account identifiers**.

**PASS:** at least 2 representative web live rooms sustain video + audio for 10 minutes; basic playback controls work. Chat send is tested separately and is **not** required for viewing-only PASS. **FAIL/BLOCKED:** reproducible forced client handoff or no usable web stream; attach evidence before considering alternative architecture.

Deliverable: `docs/CP-00-browser-feasibility.md` with test matrix and screenshots/log summary. Do **not** claim CP-00 passed before running these tests.

### CP-01 — Userscript project skeleton

- [ ] Create a clear structure: `src/core/`, `src/adapters/douyin/`, `src/features/`, `src/ui/`, `tests/`, `docs/`.
- [ ] Install lightweight build tooling and `npm run build`, `npm run test` commands; output a loadable `dist/douyinex.user.js`.
- [ ] Restrict `@match` to known Douyin web live URLs; use least-privilege `@grant` and `@connect`.
- [ ] Provide idempotent initialization and disposal for SPA navigation; prevent duplicate observers/listeners.
- [ ] No remote script execution or unnecessary external `@require` libraries.
- [ ] Document installation through a maintained userscript manager.

**PASS:** script installs in Chrome/Edge, prints an identifiable but non-spammy init message, survives room switching without duplicate UI and cleanly disables all features.

### CP-02 — Settings panel and interaction shell

- [ ] Floating DouyuEx-style menu entry near live controls, without breaking native layout.
- [ ] Sections: playback, danmaku, page cleanup, multimedia, advanced, diagnostics.
- [ ] Per-feature enable/disable; show availability (“supported / unsupported / needs test”).
- [ ] Preferences stored locally, with export/import/reset and safe defaults.
- [ ] Keyboard and accessibility support; settings stay usable across viewport sizes.
- [ ] Feature registry architecture: `id, defaultEnabled, mount(), dispose(), capabilities`.

**PASS:** toggles persist after refresh and navigation; turning a feature off removes its observers and visual changes.

### CP-03 — Page cleanup (low-risk MVP)

- [ ] Hide configurable ads/promotions, gift toolbars and intrusive overlays using scoped CSS.
- [ ] Simple / theater / dark-layout modes when compatible.
- [ ] Do not hide critical account, reporting, payment or safety UI unintentionally.
- [ ] Do not break follow, chat or playback; selectors versioned in the Douyin adapter.
- [ ] Maintain a visible “restore original layout” button.

**PASS:** multiple room layouts tested; toggles are reversible without refresh and unrelated UI remains functional.

### CP-04 — Player enhancements

- [ ] Detect active `HTMLVideoElement`/player container safely.
- [ ] Quality display / selection using options **actually exposed by the web player**; prefer saved highest **available** quality.
- [ ] Volume mouse wheel only when pointer is over player; correct scroll outside player.
- [ ] Optional fullscreen, player crop/zoom, playback status and anti-accidental pause.
- [ ] Detect if player/stream is not accessible, disable unsupported controls instead of guessing URLs.
- [ ] Do not promise 2K/original bitrate when web account/room does not expose it.

**PASS:** playback survives room switch, quality change and repeated enable/disable; no duplicate event handlers.

### CP-05 — Danmaku observation and rendering adapter

- [ ] Prefer visible chat DOM or official page-provided state; introduce read-only message parsing only when necessary.
- [ ] Normalize `{id, roomId, author, text, timestamp, kind, source}` with stable best-effort message identity.
- [ ] Keyword filtering, repeated-message filtering, optional display preferences.
- [ ] Support virtualized lists / SPA re-render, avoid unnecessary polling and excessive MutationObserver work.
- [ ] Separate **read-only observing** from **sending**. Sending always goes through an explicit user action.
- [ ] Handle `textarea`, `contenteditable`, IME composition, emojis and reactive framework input updates.

**PASS:** danmaku filter behaves on a busy room without freezing scroll; no messages are sent by merely observing.

### CP-05.1 — Danmaku “+1” (P1 / required Beta)

Reference: [DouyuEx BarragePanel_Tip.js](https://github.com/qianjiachun/douyuEx/blob/master/src/packages/BarragePanel/BarragePanel_Tip.js).

- [ ] In message context menu or hover action, show `+1` on ordinary text messages; keep controls unobtrusive.
- [ ] One explicit user click copies the selected **message body** to a safe draft; provide “Send now” only if sending via the native web input is verified.
- [ ] Display/preview the exact final text, especially if CP-05.2 suffix/prefix is enabled.
- [ ] Never copy author name, hidden markup, HTML or system messages as text accidentally.
- [ ] Handle emoji/mention content as text where possible; if fidelity is unavailable, fall back to draft-only and explain.
- [ ] Respect platform length limit and cooldown, protect from repeated double clicks, never loop-send.
- [ ] After SPA navigation/re-renders, actions point to the correct message; no stale text.

**PASS:** user can +1 a normal danmaku exactly once through a deliberate action; correct original text appears and user receives an accurate success/failure indication, verified in a real room. If native sending is not feasible, draft-only must be labeled as partial, not done.

### CP-05.2 — Prefix / suffix “小尾巴” (P1 / required Beta)

Reference: [DouyuEx DanmakuTail.js](https://github.com/qianjiachun/douyuEx/blob/master/src/packages/DanmakuTail/DanmakuTail.js).

- [ ] Configurable free-text `content`; mutually exclusive **prefix / suffix** mode; enable/disable toggle.
- [ ] Example suffix `【DouyinEx】`: `今天主播打得不错` → `今天主播打得不错【DouyinEx】`.
- [ ] Persist settings locally and make it easy to temporarily bypass the decoration.
- [ ] Apply the tail **exactly once** for both Enter and native send-button actions, including CP-05.1 +1 flow.
- [ ] Handle IME composition, Shift+Enter where applicable, empty input, whitespace and platform character limits.
- [ ] Avoid duplicating prefix/suffix already present; avoid accidental double submission or infinite input-event loops.
- [ ] Work across both `textarea` and `contenteditable`, if the actual page uses either.
- [ ] When a room disallows sending, do not repeatedly retry; expose an informative disabled state.

**PASS:** user-initiated Enter and button sends include the configured suffix/prefix **once**; normal messages remain unchanged when disabled; +1 and suffix compose correctly. Must be manually tested in a real logged-in room.

### CP-06 — Picture in picture and multi-room

- [ ] Use native Picture-in-Picture when supported; show fallback if unsupported.
- [ ] Multiview: open user-selected live rooms in independent view tiles without bypassing auth restrictions.
- [ ] Mute/background pause policy, CPU/network guardrails, close/reorder controls.
- [ ] Cleanly dispose players and observers on close.

**PASS:** 2-room multiview in Chrome remains functional for 15 minutes, with no orphan audio after closing either tile.

### CP-07 — Multimedia tools

- [ ] Frame screenshot with filename and browser permission checks.
- [ ] Optional short clip / GIF capture via allowed media capabilities, including CORS/DRM failure handling.
- [ ] Export locally observed text danmaku with timestamps; optional ASS generation only if data quality is verified.
- [ ] Never claim capture/download works for protected or unavailable streams.

**PASS:** screenshot works on a testable allowed room; unsupported export cases fail clearly rather than silently.

### CP-08 — Statistics and optional utilities

- [ ] Read-only event statistics: danmaku volume, approximate rate, observed gift/like events where web data actually exposes them.
- [ ] Label estimates and observation windows; do not present inferred counts as official real audience numbers.
- [ ] Optional quick replies/history with explicit manual confirmation. No unsolicited mass replies.
- [ ] Treat platform-specific tasks (sign-in rewards, account switching, gifts, lotteries, red packets) as **separate feasibility reviews**. Keep disabled/not promised until lawful support and account safety are verified.
- [ ] Build a DouyuEx→DouyinEx parity matrix: `equivalent / partial / app-only / unavailable / intentionally excluded`.

**PASS:** stat sources and limitations documented; all network/account-affecting optional actions remain opt-in.

### CP-09 — Release quality, security and compatibility

- [ ] Privacy/security audit: permissions, cookies/tokens, external requests, dependency lockfile, HTML injection/XSS, local storage.
- [ ] No analytics or tracking by default. No credential collection, no hidden transmission of session tokens.
- [ ] Regression suite covering SPA navigation, clean init/dispose, settings restore, +1, suffix, player and cleanup.
- [ ] Test current Chrome/Edge and at least two live-room layouts; record tested dates.
- [ ] README: installation, screenshots, limitations, risk disclaimer, supported versions and changelog.
- [ ] MIT licensing for original code; preserve any third-party notices and comply with incorporated dependency licenses.
- [ ] Release tagged Beta only after all enabled CP acceptance criteria pass.

**PASS:** source and generated script align, build/test commands pass, manual acceptance evidence linked, no known high-severity security defects.

## 3. Delivery waves / suggested order

1. **Gate:** CP-00 (browser playback evidence).
2. **Alpha:** CP-01 → CP-02 → CP-03.
3. **Beta:** CP-04 → CP-05 → CP-05.1 → CP-05.2 (prioritize +1 and tail as mandatory Beta scope).
4. **Advanced:** CP-06 → CP-07 → CP-08, developed independently once core adapters stabilize.
5. **Release:** CP-09 is continuous but must be explicitly passed before release.

## 4. Definition of Done for each CP

Every checkpoint PR must include:
- **What changed** and feature flag / scope.
- **How tested**: automated tests, manual browser + room types + date.
- **Evidence**: short screen recording/screenshots or sanitized logs when feasible.
- **Known unsupported scenarios** and roll-back path.
- **No extra platform-specific logic inside generic UI modules.**
- **Update this file**: change `[ ]` to `[x]` only for verified, merged work.

## 5. First Codex task

> Implement **CP-00 only**: document a reproducible browser feasibility test matrix and a small, read-only browser diagnostic userscript if needed. Do not mark playback supported without actual desktop browser playback evidence. Do not begin private API reverse engineering, automatic chat sending or account operations. Then open a small PR with evidence, unresolved questions and a proposed CP-01 skeleton.

## 6. References

- Original feature inspiration: https://github.com/qianjiachun/douyuEx
- Original +1 implementation: https://github.com/qianjiachun/douyuEx/blob/master/src/packages/BarragePanel/BarragePanel_Tip.js
- Original tail implementation: https://github.com/qianjiachun/douyuEx/blob/master/src/packages/DanmakuTail/DanmakuTail.js
- Douyin web live entry: https://live.douyin.com/
- Potential related community work to evaluate, not automatically trust or copy: https://github.com/skmcj/dycast

---

**Status at creation:** CP-00 through CP-09 and CP-05.1/05.2 are all planned / not implemented. The initial GitHub repository only contained README and LICENSE.
