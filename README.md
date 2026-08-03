# Insytful AI Search Components

AI-powered search modals for the web. Ships in two flavours — a standalone **Web Component** for any HTML page, and **React components** for React applications. Both share the same visual design, theming, and Insytful RAG API integration.

## Install

**React:**

```bash
npm install insytful-ai-search-components
```

Peer dependencies: `react` (>=17) and `react-dom` (>=17).

**Web Component** — single script tag, no build step:

```html
<script src="https://unpkg.com/insytful-ai-search-components@3/dist/insytful-search.js"></script>
```

Pin the major version in the URL (`@3`, as above) rather than using an unversioned URL — unversioned URLs auto-upgrade to every new release within CDN cache TTL, future breaking changes included.

## Migrating to 3.0

**Breaking change:** `RAGClient.ask()` — reachable on the Web Component via `element.ragClient` — now yields `RAGStreamEvent` objects instead of plain strings, so CTA frames can flow through the same stream:

```js
// Before (2.x) — ask() yielded answer text chunks
for await (const chunk of element.ragClient.ask(question)) {
  answer += chunk;
}

// After (3.x) — ask() yields RAGStreamEvent objects
for await (const ev of element.ragClient.ask(question)) {
  if (ev.kind === "token") answer += ev.content;
  // ev.kind === "ctas" carries the sanitized Cta[] for the answer
}
```

Everything else is additive (see [CHANGELOG.md](./CHANGELOG.md)). If you use the components without touching `ragClient`, no code changes are needed.

## React

```tsx
import { useState } from 'react';
import { InsytfulSearch } from 'insytful-ai-search-components';

export function App() {
  const [open, setOpen] = useState(false);

  return (
    <InsytfulSearch.Root
      options={{ config: 'your-config', baseUrl: 'https://your-api.com' }}
      open={open}
      onOpenChange={setOpen}
    >
      <InsytfulSearch.Trigger>Search</InsytfulSearch.Trigger>
      <InsytfulSearch.Portal>
        <InsytfulSearch.Title>How can we help?</InsytfulSearch.Title>
        <InsytfulSearch.Input />
        <InsytfulSearch.Messages />
        <InsytfulSearch.Suggestions />
      </InsytfulSearch.Portal>
      <InsytfulSearch.Close />
    </InsytfulSearch.Root>
  );
}
```

[Full React guide →](https://insytful.com/help-and-docs/guides/insytful-ai-search/react-implementation)

### Loading message rotation (React only)

Customise the loading message that displays while the AI is generating a response. Messages rotate based on elapsed time (in milliseconds):

```tsx
<InsytfulSearch.Messages
  searching={{
    messages: [
      { from: 0, to: 1000, text: "Searching..." },
      { from: 1000, to: 4000, text: "Finding the most relevant pages..." },
      { from: 4000, to: 6000, text: "Finding the most relevant pages..." },
      { from: 6000, to: "Infinity", text: "Writing an answer..." },
    ],
  }}
/>
```

If `searching` is not provided, the default message "Generating response..." is used. Timestamps are in milliseconds (e.g., `1000` = 1 second, `6000` = 6 seconds).

**Note:** Message rotation is currently available in React only. Web Component support can be added in a future release if needed.

### reCAPTCHA (React only)

Protect your search endpoint from bots and spam by passing a Google reCAPTCHA v3 site key. When provided, a token is generated for each query and sent as an `X-Recaptcha-Token` header — your backend is responsible for verifying it against Google's [siteverify API](https://developers.google.com/recaptcha/docs/verify).

```tsx
<InsytfulSearch.Root
  options={{
    config: 'your-config',
    baseUrl: 'https://your-api.com',
    recaptchaSiteKey: 'your-recaptcha-v3-site-key',
  }}
>
  ...
</InsytfulSearch.Root>
```

If `recaptchaSiteKey` is omitted, no reCAPTCHA script is loaded and no token is sent.

Get a site key (and its paired secret key, for your backend to verify tokens) from the [Google reCAPTCHA admin console](https://www.google.com/recaptcha/admin/create) — register a **v3** key type and add the domain(s) your app runs on.

**Note:** reCAPTCHA is currently available in React only. Web Component support can be added in a future release if needed.

## Web Component

```html
<script src="https://unpkg.com/insytful-ai-search-components@3/dist/insytful-search.js"></script>

<insytful-search api-uri="https://your-api.com" project-id="your-project">
  <button slot="trigger">Search</button>
  <span slot="title">How can we help?</span>
  <insytful-suggestion slot="suggestions"></insytful-suggestion>
  <insytful-close slot="close"></insytful-close>
</insytful-search>
```

[Full Web Component guide →](https://insytful.com/help-and-docs/guides/insytful-ai-search/web-component-implementation)

## Quick action CTAs (calls-to-action)

The Insytful RAG API can send calls-to-action with an answer — configured per-site in the CMS and selected server-side per query. The components render them as a "Quick actions" row above the answer (visible while it streams): `link` / `call` / `email` CTAs are real anchors that navigate natively, and `event` CTAs are buttons that dispatch a CMS-named event on a shared event bus. No setup is required for the defaults; the hooks below let you observe or override them.

### Observing clicks

**React** — the `onCtaClick` prop on `Search.Root` receives the full sanitized `Cta`:

```tsx
<InsytfulSearch.Root
  options={{ config: 'your-config', baseUrl: 'https://your-api.com' }}
  onCtaClick={(cta) => analytics.track('ai_search_cta_click', { type: cta.type, label: cta.label })}
>
```

**Web Component** — listen for the composed `insytful-cta-click` DOM event on the element:

```js
document.querySelector('insytful-search')
  .addEventListener('insytful-cta-click', (e) => {
    console.log('CTA clicked:', e.detail); // the full Cta object
  });
```

Both fire on every CTA click and never cancel the action — they are observability hooks, not interception points. To change what a click *does*, register a handler override.

### Overriding execution

`registerCtaHandler(type, handler)` replaces the built-in action for one CTA type (`"link" | "call" | "email" | "event"`) and returns an unregister function that restores the previous behaviour:

```ts
// React / npm:
import { registerCtaHandler } from 'insytful-ai-search-components';

// Web Component / script tag:
const { registerCtaHandler } = window.InsytfulSearch;

const unregister = registerCtaHandler('link', (cta) => {
  myRouter.navigate(cta.url); // cta is narrowed to the "link" variant
});

// Later — restore the default (native navigation):
unregister();
```

The handler registry is shared across every component instance on the page (and between the React bundle and the Web Component bundle when both are loaded), so register once, not per instance.

### `event` CTAs and the event bus

`event`-type CTAs dispatch their CMS-configured event name on a shared `EventTarget` at `window.insytfulAISearchEvents`. Host pages subscribe using this exact guarded form (it works whether the host script runs before or after the package loads):

```html
<script>
  (window.insytfulAISearchEvents ??= new EventTarget()).addEventListener("openWebChat", (e) => {
    MyChatVendor.load().then(() => MyChatVendor.open(e.detail?.topic));
  });
</script>
```

Three similar event names, different transports:

| Event | Transport | When it fires | Use it for |
|---|---|---|---|
| `insytful-cta` | Bus (`window.insytfulAISearchEvents`) | Every CTA execution, click or programmatic; detail is `{ name, cta }` | Observability / analytics across all CTA types |
| `insytful-cta-click` | Composed DOM event from the `<insytful-search>` element | User clicks a CTA in the Web Component; detail is the `Cta` | Per-element click tracking, host reactions (e.g. closing the modal) |
| CMS-named events (e.g. `openWebChat`) | Bus (`window.insytfulAISearchEvents`) | An `event`-type CTA executes | The functional contract — actually doing the thing |

Notes:

- `e.detail` is CMS-authored data — treat it as untrusted: never `innerHTML` it and never deep-merge it into configuration objects.
- Bus events are forgeable by any script on the page — make no security decisions based on them.
- The bus is same-realm only — embedded iframes need `postMessage`, not the bus.
- CTA `detail` payloads must never carry user-derived or personal data (they are CMS configuration, not query context).
- Pages with multiple search instances share one handler registry and one bus by design.

### Closing the modal from a CTA

The package never auto-closes the modal on a CTA click (a web-chat widget opened behind the modal would be invisible, but that is the host's call). Close it yourself in your handler:

```tsx
// React — via onOpenChange state:
<InsytfulSearch.Root open={open} onOpenChange={setOpen}
  onCtaClick={(cta) => { if (cta.type === 'event') setOpen(false); }}>
```

```js
// Web Component:
const el = document.querySelector('insytful-search');
el.addEventListener('insytful-cta-click', (e) => {
  if (e.detail.type === 'event') el.close();
});
```

### Theming CTAs

The CTA row is themable through CSS custom properties (hook classes: `insytful-search-cta-bar`, `insytful-search-cta-label`, `insytful-search-cta-btn`, `insytful-search-cta-btn-primary`, `insytful-search-cta-btn-secondary`):

```css
--insytful-cta-bar-gap: 8px;
--insytful-cta-radius: 9999px;
--insytful-cta-label-text: var(--insytful-text-muted);
--insytful-cta-primary-bg-default: #2e3339;
--insytful-cta-primary-bg-hover: #3c444d;
--insytful-cta-primary-text: #ffffff;
--insytful-cta-primary-border: transparent;
--insytful-cta-secondary-bg-default: transparent;
--insytful-cta-secondary-bg-hover: #f2f2f2;
--insytful-cta-secondary-text: var(--insytful-text-default);
--insytful-cta-secondary-border: #c8cdd3;
```

Dark-theme override (via the `theme` prop/attribute):

```css
.insytful-root {
  --insytful-cta-primary-bg-default: #e8eaed;
  --insytful-cta-primary-bg-hover: #ffffff;
  --insytful-cta-primary-text: #1a1d21;
  --insytful-cta-secondary-bg-hover: #2a2f36;
  --insytful-cta-secondary-border: #4a515a;
}
```

## Local development

```bash
npm install
npm run storybook
```

Opens Storybook with live, hot-reloadable demos of both flavours — the React modal and the standalone Web Component — each running against a mocked API response so no backend is required. Storybook is dev tooling only; it is never bundled into the published package.

## Release checklist

Before publishing a new version:

```bash
# 1. Verify code quality
npm run lint

# 2. Run tests
npm run test

# 3. Build all outputs (React components + Web Component)
npm run build:all

# 4. Create package tarball (optional, for inspection)
npm run pack

# 5. Publish to npm (when ready)
npm publish
```

The `npm publish` step is handled by the `prepublishOnly` hook, which runs `npm run build:all` automatically to ensure dist files are up-to-date.

## Configuration & theming

See the [full documentation on insytful.com](https://insytful.com/help-and-docs/guides/insytful-ai-search/overview) for configuration options, [theming](https://insytful.com/help-and-docs/guides/insytful-ai-search/theming), and API details.

Both variants scale text size with the browser's text-size preferences via the `--insytful-base-font-size` CSS variable, ensuring accessibility for users with vision needs.

## Accessibility

Both versions share the same accessibility features:

- Dialog uses `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`
- Focus trapped via [focus-trap](https://github.com/focus-trap/focus-trap)
- `Escape` closes; clicking outside deactivates the focus trap
- Trigger elements expose `aria-expanded` and `data-state`
- `inert` hides the dialog from assistive tech when closed
- Respects `prefers-reduced-motion`

## Browser support

Modern browsers with [Shadow DOM v1](https://caniuse.com/shadowdomv1) and [`:has()`](https://caniuse.com/css-has) (Chromium 105+, Safari 15.4+, Firefox 121+). Client-side rendering only (no SSR).

## Licence

MIT
