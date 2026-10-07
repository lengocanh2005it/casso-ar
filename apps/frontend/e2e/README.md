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
needed: guest routes render with the API down, while authenticated routes use
fixed browser-side API and session stubs.

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

Every test runs at all five projects:

| Project    | Width | Why                                        |
| ---------- | ----- | ------------------------------------------ |
| `phone-sm` | **360** | common Android width — the narrowest that still fits the OTP row |
| `phone`    | 390   | a real phone                               |
| `md-edge`  | **767** | the last pixel where `max-md:` still applies |
| `tablet`   | 900   | between the two breakpoints — where a `sm:`/`md:`/`lg:` layout silently breaks |
| `desktop`  | 1024  | desktop                                    |

`767` is deliberate. Tailwind v4's `md` is 768px, so `max-md:` means *below*
768. Asserting at 768 would test the width where the variant is already off and
pass for the wrong reason. `767` pins the narrow side of the boundary.

`900` exists because the boundary widths are not where layout actually breaks.
A defect can hide at every edge and still appear in between; the signup confirm
step shipped a 74px document overflow that only `phone` caught, and the auth
card's tap targets were under 44px at all four. Edges alone would have missed
one of those.

`360` was added after review: six 44px OTP boxes plus five 8px gaps need 304px,
and the auth card offers 280px at that width. With only `phone` 390 in the
matrix, that overflow was invisible.

## Tap targets

`assertMinTapTarget` uses two thresholds:

- **44px** for inputs and buttons.
- **24px** for inline text links, which sit in the text flow and cannot be 44px
  tall without moving the surrounding prose. 24px is the WCAG 2.2 AA target
  size floor (SC 2.5.8); links get vertical padding to reach it.

A `<label>` that wraps a small checkbox is the real target, not the checkbox
itself — measure the label.

`assertHitTestable` accepts only the element or one of its descendants. An
ancestor does not count: `disabled` controls carry `pointer-events: none`, so
`elementFromPoint` returns an ancestor and a control that cannot be clicked at
all would otherwise pass. Fill a field before asserting a button that is
disabled until the field has a value.

## Stubbing the API

The harness boots only the frontend, so `/api/*` calls are intercepted by
`fixtures/stub-api.ts`. Use `stubApi()` for guest routes and `stubSession()` for
routes behind `ProtectedRoute`, which writes the local session hint before the
app's first script runs.

An unmatched `/api/` call answers **501** *and* is recorded; importing this
module installs an `afterEach` that fails the test if the record is not empty.
The 501 alone is not enough — an unstubbed call is usually a background fetch
that never blocks the ready selector, so the suite would otherwise stay green
with a forgotten stub.

The catch-all matches the API *host*, not a path glob: `**/api/**` also swallows
the dev server's own module requests
(`features/reports/api/use-reports.ts`), which silently 501s source files and
stops the page mounting.

## Data-table coverage

`data-tables.e2e.ts` exercises `/customers`, `/receivables`, `/exceptions`, and
the reminder execution history on all five viewport projects. The test installs
fixed API responses in the browser; it needs no backend or database. Its three
customer names are over 200 characters and are reused in related table rows.

At 360px, 390px, and 767px, customer and receivable rows use their `md` card
layout. Exception rows preserve their `lg` card layout through 900px; their
header stays hidden there too. Reminder executions keep a regular table and its
own horizontal scroll area at narrow widths. All four tables must keep rows at
or below 120px below 1024px and 64px at 1024px, keep cell content inside its
cell, and avoid document-level horizontal scroll. The customer name must remain
truncated while its full value is available through the app tooltip.

Run only this coverage with:

```bash
pnpm --filter @casso-ar/frontend test:viewport -- --grep "data tables"
```

## Files

- `playwright.config.ts` — projects, web server, artifacts
- `layout-invariants.ts` — the reusable assertions
- `fixtures/stub-api.ts` — `stubApi` / `stubSession` for guest and protected routes
- `fixtures/data-table-api-fixture.ts` — fixed auth and table payloads for #456
- `auth.e2e.ts` — login, all four signup steps, email verification, forgot and
  reset password, invite acceptance, admin login
- `onboarding.e2e.ts` — the onboarding account picker, both states
- `*.e2e.ts` — the tests. The `.e2e.ts` suffix keeps Playwright's default
  `*.spec.ts`/`*.test.ts` match off these files and keeps Vitest's default
  `*.spec.ts` match off Playwright's; both sides pin the pattern explicitly.

## Adding an invariant

Add it to `layout-invariants.ts`, then call it from a test. Do not add
`data-testid` attributes to app components for this; use the accessible name or a
stable existing selector.

## What this does not cover

- **Other routes and components.** Auth/onboarding and the four data tables are
  covered; other routes need route-specific layout assertions.
- **CI.** Deliberately not in `pnpm verify` or `.github/workflows/ci.yml` yet;
  tracked in #457.

Auth/onboarding clipping is checked by `assertInsideContainer` and
`assertHitTestable`; data-table text containment is checked by the data-table
coverage above.
