# Changelog

## 3.2.0 — 2026-08-13

### Changed

- **`query-collection` requests are now `POST` with a JSON body**, following the AI Search API's move off `GET`. Every parameter (`question`, `config`, `history`, `stream`, `sections`) moved from the query string into the body, sent with `Content-Type: application/json`. This removes the URL length ceiling that previously capped how long a question could be.

  **This release requires an AI Search API that accepts `POST` on `/query-collection`.** No consumer code changes: the components, hooks, props, and `RAGClient.ask()` signature are all unchanged — only the request this library makes on your behalf. Script-tag consumers pinned to `…@3/dist/insytful-search.js` pick this up automatically.

  Applies to all three request paths: `useRAGConversation`, `useRAGResponse`, and the Web Component's `RAGClient`.

- Session and reCAPTCHA behaviour is unchanged — `X-Session-Id` is still read from and written back to `localStorage`, and `X-Recaptcha-Token` is still sent when a site key is configured. Both are enforced on `POST` server-side.

### Notes

- Streaming was unaffected. This library has never used `EventSource` (which cannot issue `POST`); `readSSEFrames` already parsed SSE off `fetch` + `ReadableStream`, including cross-chunk frame buffering, per-frame `event:` scoping, and `:` keepalive comments.
- Cross-origin deployments should expect a CORS preflight (`OPTIONS`) on each request, which the API allows.

## 3.1.0 — 2026-08-03

### Removed

- **The `widget` portal variant.** `Search.Root`'s `variant` prop and the `--insytful-widget-*` CSS variables are gone; the search UI is always the full-bleed modal, which locks body scroll while open. Consumers passing `variant="modal"` can drop the prop; consumers passing `variant="widget"` have no replacement.

## 3.0.1 — 2026-07-16

### Fixed

- **Web Component: CTAs never rendered.** `RAGClient` passed the whole `{"ctas":[...]}` frame payload to the sanitizer instead of the array, dropping every CTA. Wire-shape parsing now lives in one shared `ctasFromFrameData()` used by both flavours.
- Storybook WC story no longer calls `open()` before the custom element upgrades.

## 3.0.0 (2026-07-15)

### Breaking

- `RAGClient.ask()` (reachable on the Web Component via `element.ragClient`) now yields `RAGStreamEvent` objects instead of answer-text strings:

  ```js
  // Before (2.x)
  for await (const chunk of client.ask(q)) answer += chunk;

  // After (3.x)
  for await (const ev of client.ask(q)) {
    if (ev.kind === "token") answer += ev.content;
  }
  ```

  Consumers that never touch `ragClient` are unaffected. Script-tag consumers should pin a major-versioned unpkg URL (`…/insytful-ai-search-components@3/dist/insytful-search.js`).

### Added

- **Quick action CTAs**: CMS-configured, server-selected calls-to-action (`link` / `call` / `email` / `event`) rendered as an accessible, themable "Quick actions" row above streaming answers, in both the React components and the Web Component. `link`/`call`/`email` render as real anchors with normalized hrefs; `event` dispatches a CMS-named event on the shared bus.
- New exports (React entry): `sanitizeCtas`, `registerCtaHandler`, `executeCta`, `getInsytfulAISearchEvents`, `InsytfulSearch.Ctas`; types `Cta`, `CtaIntent`, `CtaCall`, `CtaEmail`, `CtaLink`, `CtaEvent`, `CtaHandlerMap`, `SearchCtasProps`, `RAGMessage.ctas?`.
- New exports (Web Component entry / `window.InsytfulSearch`): `registerCtaHandler`, `executeCta`; type `RAGStreamEvent`.
- New prop: `onCtaClick` on `Search.Root`.
- New events: `insytful-cta-click` (composed DOM event from `<insytful-search>`, fired on user clicks), `insytful-cta` (generic observability event on the bus, fired on every execution), plus CMS-named events for `event`-type CTAs on the bus. `insytful-message` detail now includes `ctas`.
- New global: `window.insytfulAISearchEvents` (shared `EventTarget` bus, created lazily with the guarded `??=` pattern).
- New CSS tokens: `--insytful-cta-*` (bar gap, radius, label text, primary/secondary bg/text/border) and hook classes `insytful-search-cta-bar` / `-label` / `-btn` / `-btn-primary` / `-btn-secondary`, in both CSS bundles.
- Shared spec-compliant SSE decoder (`readSSEFrames`) adopted by all three stream consumers; fixes dropped named-event frames, CRLF/lone-CR handling, split multibyte chunks, and the final unterminated frame.
- Dev-mode mocks and Storybook stories now exercise the full CTA bar (all four types, including a stream-error-after-CTAs story).

### Dependencies

- Added `eventsource-parser` (^3.1.0, ~1 kB gzip) for SSE parsing.
