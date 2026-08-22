# FE UI Polish Wave 3

## Status

Approved for implementation. This wave completes the visual audit for the
secondary and edge surfaces without changing product behavior or contracts.

## Goal

Make Copilot, Admin, Auth/Onboarding, Landing, and Not-found feel intentional
at their actual jobs instead of leaving sparse panels, generic cards, or
unbalanced empty states behind.

## Design direction

Use one calm Casso Ledger foundation with four deliberate accents:

- Copilot: violet is reserved for AI actions, drafts, and the locked-plan gate.
- Admin: slate/blue signals operational visibility and keeps the console
  separate from customer-facing finance green.
- Auth/Onboarding: green and soft mint signal progress, trust, and the first
  successful bank connection.
- Landing/Not-found: keep the existing marketing identity, use green as the
  anchor, and add one strong visual focal point per section rather than filling
  whitespace with extra cards.

Typography remains Be Vietnam Pro. Existing shared layout primitives, Lucide,
Tailwind, Framer Motion, and CSS variables remain the only visual toolkit.

## Scope requirements

### Copilot

- Keep the full-height chat workspace and desktop/mobile history/drafts panels.
- Use violet only on the Copilot identity, welcome state, draft status/action
  cues, and plan gate; normal controls remain neutral/green.
- Make the welcome state feel like a starting point with clear suggestion
  buttons, not a large empty well.
- Make the composer, stop/send actions, pending action card, draft list, and
  loading/empty states read as one workflow.
- Keep plan gating, permission checks, streaming, drafts, dialogs, and routes
  unchanged.

### Admin

- Give the admin shell a compact but recognizable console header/nav and keep
  skip-link, routes, and full-height scrolling behavior.
- Align admin page headings and chart/table sections with Wave 1 hierarchy.
- Use empty/loading/error states with clear operational meaning; never invent
  usage data.
- Keep operator permissions, organization actions, pagination, date filters,
  and mutation dialogs unchanged.

### Auth and Onboarding

- Make the auth card family consistent across login, signup, password recovery,
  invite acceptance, verification, and status screens.
- Keep form labels, validation, OTP flow, redirects, loading/error states, and
  accessible focus behavior unchanged.
- Make onboarding communicate one clear step: connect a bank, understand why,
  then continue; preserve the non-manager waiting state and auto-refresh.
- Use soft brand surfaces and a restrained progress cue instead of decorative
  multi-step scaffolding.

### Landing and Not-found

- Preserve the existing marketing structure, anchors, links, reduced-motion
  behavior, and pricing data.
- Improve hero-to-sections rhythm, product showcase framing, feature/pricing
  scanability, and CTA hierarchy.
- Keep the existing Not-found route behavior and home/back actions while making
  the error focal point compact and readable.
- Do not add new imagery, copy-heavy sections, or a second brand system.

## Constraints

- No backend, API, domain, database, routing, or dependency changes.
- Reuse Wave 1 `PageHeading`, `PageHeader`, `HeaderIcon`, `SectionCard`, `Card`,
  `Table`, and `EmptyState` where they fit; no new global primitive for a
  single use.
- Preserve permissions, plan gates, query parameters, API calls, mutation and
  dialog behavior, keyboard focus, dark mode, and reduced-motion behavior.
- Decorative icons use `aria-hidden="true"`; icon-only controls keep labels.
- User-visible copy remains Vietnamese except existing product terms.
- Do not invent metrics, records, or testimonials.

## Acceptance criteria

- Each scoped area has one clear visual focal point and no accidental sparse
  strip or double-padded card stack.
- Empty, loading, error, locked, and populated states remain distinguishable
  and accessible.
- Color communicates domain/status but is always paired with text or icon.
- Forms, dialogs, controls, and tables remain usable at 375px, 768px, 1280px,
  and 1920px.
- Existing focused tests, frontend type-check, build, and scoped lint pass.
