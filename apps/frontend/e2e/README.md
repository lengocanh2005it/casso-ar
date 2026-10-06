# Viewport harness

Playwright tests that assert **layout invariants** on a real browser.

## Layout invariant

A layout invariant is a property that must hold at a given viewport width.
jsdom cannot check one: it has no layout engine, so `max-md:grid` reflow never
actually applies and a jsdom test can only assert that a class string exists. That
gap is how three 200-character customer names shipped at 137px row height.

Invariants are asserted with `expect(...).toBe*()`, never with a raw
`boundingBox()` compared once — `expect` polls, which absorbs the last of the
font-loading and animation timing. `reducedMotion: 'reduce'` is set globally; the
app already honours it with `motion-reduce:` and `useReducedMotion`.

## Always navigate with `openRoute`

```ts
await openRoute(page, '/', '[aria-label="Casso AR — Trang chủ"]');
```

Do not call `page.goto()` directly before measuring. `goto` resolves on the `load`
event, which fires before React mounts. A cold guest route shows `AuthLoading`
while the auth effect resolves, and the page itself is lazy-loaded behind a
Suspense fallback. Both placeholders are narrow, so measuring during either
window reads a zero overflow delta and the assertion passes without ever having
looked at the real layout — a silently passing test, which is the exact failure
this harness exists to prevent. `document.fonts.ready` does not help: it is
already resolved at that point.

Pass a `readySelector` that exists only on the fully rendered route.

## Setup

```bash
pnpm --filter @casso-ar/frontend test:viewport:install
```

Downloads Playwright's bundled chromium (~150MB). No backend or database is
needed: the covered routes are guest-only and render with the API down.

If your network blocks `cdn.playwright.dev`, point Playwright at a browser
already installed on the machine instead of downloading one:

```bash
PLAYWRIGHT_CHANNEL=chrome pnpm --filter @casso-ar/frontend test:viewport
```

`PLAYWRIGHT_CHANNEL` is unset by default, so CI gets the bundled, pinned build.

## Running

```bash
pnpm --filter @casso-ar/frontend test:viewport
```

A dev server is started on :5173 and torn down afterwards. If one is already
running locally it is reused instead.

Run a single test by name:

```bash
pnpm --filter @casso-ar/frontend test:viewport -- --grep "never scrolls horizontally"
```

Single project, i.e. one width:

```bash
pnpm --filter @casso-ar/frontend test:viewport -- --project=phone
```

Failures leave a screenshot, a trace, and an `error-context.md` under
`apps/frontend/test-results/`. Inspect the DOM state with
`pnpm --filter @casso-ar/frontend exec playwright show-trace <path>/trace.zip`.

## Viewport widths

Every test runs at all three projects:

| Project    | Width | Why                                        |
| ---------- | ----- | ------------------------------------------ |
| `phone`    | 390   | a real phone                               |
| `md-edge`  | **767** | the last pixel where `max-md:` still applies |
| `desktop`  | 1024  | desktop                                    |

`767` is deliberate. Tailwind v4's `md` is 768px, so `max-md:` means *below*
768. Asserting at 768 would test the width where the variant is already off and
pass for the wrong reason. `767` pins the narrow side of the boundary.

## Files

- `playwright.config.ts` — projects, web server, artifacts
- `layout-invariants.ts` — the reusable assertions
- `*.e2e.ts` — the tests. The `.e2e.ts` suffix keeps Playwright's default
  `*.spec.ts`/`*.test.ts` match off these files and keeps Vitest's default
  `*.spec.ts` match off Playwright's; both sides pin the pattern explicitly.

## Adding an invariant

Add it to `layout-invariants.ts`, then call it from a test. Do not add
`data-testid` attributes to app components for this; use the accessible name or a
stable existing selector.

## What this does not cover

- **Clipped content.** `assertNoHorizontalScroll` only catches overflow. Content
  clipped by an `overflow-hidden` ancestor has no scrollbar and no width delta, so
  it passes. The landing navbar clipped its own signup link this way before
  `lg:` moved that row's breakpoint. Tracked in #455/#456.
- **Bounded row height.** Needs the long-name data path; tracked in #456.
- **Authenticated and operator-portal routes.** Needs a session; tracked in #455.
- **CI.** Deliberately not in `pnpm verify` or `.github/workflows/ci.yml` yet;
  tracked in #457.
