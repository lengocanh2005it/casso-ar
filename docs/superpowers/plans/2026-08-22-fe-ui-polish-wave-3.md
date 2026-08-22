# FE UI Polish Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the frontend visual audit for Copilot, Admin, Auth/Onboarding, Landing, and Not-found with bounded feature-local changes.

**Architecture:** Reuse the Wave 1 shared visual contract and keep each Wave 3 area in its existing feature boundary. Dispatch four independent tasks with disjoint write-sets, review each task, then run whole-frontend verification.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix/shadcn primitives, Lucide icons, Framer Motion, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-fe-ui-polish-wave-3-design.md`

## Global Constraints

- No backend, API, domain, database, routing, or dependency changes.
- Reuse Wave 1 `PageHeading`, `PageHeader`, `HeaderIcon`, `SectionCard`, `Card`, `Table`, and `EmptyState` where they fit; no new global primitive for a single use.
- Preserve permissions, plan gates, query parameters, API calls, mutation and dialog behavior, keyboard focus, dark mode, and reduced-motion behavior.
- Decorative icons use `aria-hidden="true"`; icon-only controls keep labels.
- User-visible copy remains Vietnamese except existing product terms.
- Do not invent metrics, records, or testimonials.
- Validate responsive layouts at 375px, 768px, 1280px, and 1920px.

## File Map

| Task | Files owned | Deliverable |
| --- | --- | --- |
| 1 | `apps/frontend/src/features/copilot/**` | Violet AI workspace with balanced welcome, draft, action, and composer states |
| 2 | `apps/frontend/src/components/layout/admin-layout.tsx`, `apps/frontend/src/features/admin/**` | Compact admin console hierarchy and operational states |
| 3 | `apps/frontend/src/components/layout/auth-status-card.tsx`, `apps/frontend/src/features/auth/**`, `apps/frontend/src/features/onboarding/**` | Consistent auth surfaces and clear bank-link onboarding |
| 4 | `apps/frontend/src/features/landing/**`, `apps/frontend/src/features/errors/not-found-page.tsx` | Tighter marketing rhythm and focused not-found state |

## Task 1: Polish Copilot workspace

**Files:**

- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.tsx`
- Modify: `apps/frontend/src/features/copilot/components/copilot-welcome-state.tsx`
- Modify: `apps/frontend/src/features/copilot/components/drafts-list.tsx`
- Modify: `apps/frontend/src/features/copilot/components/usage-indicator.tsx`
- Modify: `apps/frontend/src/features/copilot/components/pending-action-card.tsx`
- Modify: `apps/frontend/src/features/copilot/components/email-draft-preview.tsx`
- Test: existing Copilot page/component specs

**Interfaces:**

- Keep `useCopilotChat`, `useCopilotConversations`, `useCopilotDrafts`, plan/permission checks, streaming controls, and every component prop unchanged.
- Keep the full-height layout and desktop/mobile panel collapse behavior unchanged.

- [ ] **Step 1: Add public-state regression assertions**

Extend the existing Copilot specs to assert that the welcome suggestions, composer actions, locked-plan CTA, empty draft message, and pending-action controls remain discoverable by their existing accessible names.

- [ ] **Step 2: Run focused Copilot tests before implementation**

```bash
pnpm --filter @casso-ledger/frontend test -- copilot-page.spec.tsx copilot-welcome-state.spec.tsx drafts-list.spec.tsx email-draft-preview.spec.tsx --run
```

- [ ] **Step 3: Implement the focused AI visual treatment**

Use `HeaderIcon` with the existing violet/AI tone for the page identity. Give the chat surface a quiet `bg-card`/border treatment, keep the central welcome block compact, use violet only for AI identity/status cues, and group composer controls so the text input remains dominant. Replace plain draft loading/empty text with compact state surfaces using existing icons or a feature-local composition; keep status labels and action text. Preserve all event handlers, mutation calls, and gate focus behavior.

- [ ] **Step 4: Run focused tests, type-check, and scoped Biome**

```bash
pnpm --filter @casso-ledger/frontend test -- copilot-page.spec.tsx copilot-welcome-state.spec.tsx drafts-list.spec.tsx email-draft-preview.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/features/copilot
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/copilot
git commit -m "feat: polish Copilot workspace"
```

## Task 2: Polish Admin console

**Files:**

- Modify: `apps/frontend/src/components/layout/admin-layout.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-organizations-page.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-organization-members-page.tsx`
- Modify: `apps/frontend/src/features/admin/components/admin-status-rail.tsx`
- Modify: `apps/frontend/src/features/admin/components/admin-usage-charts.tsx`
- Test: existing Admin layout/page/component specs

**Interfaces:**

- Keep admin routes, `AdminStatusRail`, operator permission checks, organization/member mutations, date filters, pagination, and chart props unchanged.
- Keep `admin-main-content` skip-link target and the existing full-height scroll container.

- [ ] **Step 1: Add structure assertions**

Extend existing admin specs to assert the admin navigation, page headings, date controls, table headings, empty usage message, and retry/error actions remain available.

- [ ] **Step 2: Run focused Admin tests before implementation**

```bash
pnpm --filter @casso-ledger/frontend test -- admin-layout.spec.tsx admin-dashboard-page.spec.tsx admin-ai-usage-page.spec.tsx admin-organizations-page.spec.tsx admin-organization-members-page.spec.tsx admin-status-rail.spec.tsx admin-usage-charts.spec.tsx --run
```

- [ ] **Step 3: Implement the operational console hierarchy**

Give `AdminLayout` a restrained slate/blue console rail and a centered readable inner frame without changing its scroll mechanics. Add semantic tones and icons to admin page headings, group date filters into a compact toolbar, give usage charts/table shared section rhythm, and use existing `EmptyState` or explicit status surfaces for no-data/loading/error branches. Keep organization/member action groups wrapping and preserve every permission condition.

- [ ] **Step 4: Run focused tests, type-check, and scoped Biome**

```bash
pnpm --filter @casso-ledger/frontend test -- admin-layout.spec.tsx admin-dashboard-page.spec.tsx admin-ai-usage-page.spec.tsx admin-organizations-page.spec.tsx admin-organization-members-page.spec.tsx admin-status-rail.spec.tsx admin-usage-charts.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/components/layout/admin-layout.tsx apps/frontend/src/features/admin
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/admin-layout.tsx apps/frontend/src/features/admin
git commit -m "feat: polish admin console surfaces"
```

## Task 3: Polish Auth and Onboarding

**Files:**

- Modify: `apps/frontend/src/components/layout/auth-status-card.tsx`
- Modify: `apps/frontend/src/features/auth/components/auth-logo-link.tsx`
- Modify: `apps/frontend/src/features/auth/components/email-otp-step.tsx`
- Modify: `apps/frontend/src/features/auth/pages/login-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/signup-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/forgot-password-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/reset-password-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/invite-accept-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/verify-email-page.tsx`
- Modify: `apps/frontend/src/features/onboarding/pages/onboarding-page.tsx`
- Test: existing Auth/Onboarding specs

**Interfaces:**

- Keep form fields, validation, auth hooks, OTP behavior, redirects, logout, bank-link mutations, permissions, and polling unchanged.
- Keep all existing accessible labels and error/live-region semantics.

- [ ] **Step 1: Add surface assertions**

Extend the existing auth/onboarding specs to assert the shared logo, primary form action, error/status messages, OTP controls, and onboarding connect/waiting copy remain visible.

- [ ] **Step 2: Run focused Auth/Onboarding tests before implementation**

```bash
pnpm --filter @casso-ledger/frontend test -- login-page.spec.tsx signup-page.spec.tsx signup-verify.spec.tsx password-pages.spec.tsx invite-accept.spec.tsx auth-flow.spec.tsx email-otp-step.spec.tsx auth-status-card.spec.tsx onboarding-page.spec.tsx --run
```

- [ ] **Step 3: Implement the trust/progress surface**

Use the existing `AuthStatusCard` and auth logo contract to give auth screens a soft mint canvas, a compact card header, and consistent primary/secondary action rhythm. Keep form density readable on mobile. Make onboarding use a small green connection cue and a clear explanatory block before the picker or waiting state; do not add fake steps or progress percentages.

- [ ] **Step 4: Run focused tests, type-check, and scoped Biome**

```bash
pnpm --filter @casso-ledger/frontend test -- login-page.spec.tsx signup-page.spec.tsx signup-verify.spec.tsx password-pages.spec.tsx invite-accept.spec.tsx auth-flow.spec.tsx email-otp-step.spec.tsx auth-status-card.spec.tsx onboarding-page.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/components/layout/auth-status-card.tsx apps/frontend/src/features/auth apps/frontend/src/features/onboarding
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/auth-status-card.tsx apps/frontend/src/features/auth apps/frontend/src/features/onboarding
git commit -m "feat: polish auth and onboarding surfaces"
```

## Task 4: Polish Landing and Not-found

**Files:**

- Modify: `apps/frontend/src/features/landing/components/landing-navbar.tsx`
- Modify: `apps/frontend/src/features/landing/components/hero-section.tsx`
- Modify: `apps/frontend/src/features/landing/components/product-showcase.tsx`
- Modify: `apps/frontend/src/features/landing/components/features-section.tsx`
- Modify: `apps/frontend/src/features/landing/components/stats-band.tsx`
- Modify: `apps/frontend/src/features/landing/components/steps-section.tsx`
- Modify: `apps/frontend/src/features/landing/components/pricing-section.tsx`
- Modify: `apps/frontend/src/features/landing/components/cta-section.tsx`
- Modify: `apps/frontend/src/features/landing/components/landing-footer.tsx`
- Modify: `apps/frontend/src/features/errors/not-found-page.tsx`
- Test: existing Landing component/page specs; no standalone Not-found spec exists

**Interfaces:**

- Keep landing anchors, links, pricing hook/data, animation variants, reduced-motion behavior, and not-found home/back behavior unchanged.
- Do not add a new image dependency or external asset.

- [ ] **Step 1: Add structural assertions**

Extend existing landing specs to assert the navigation links, hero actions, section IDs/headings, pricing loading/error branches, CTA links, and not-found home/back actions remain available.

- [ ] **Step 2: Run focused Landing/Not-found tests before implementation**

```bash
pnpm --filter @casso-ledger/frontend test -- landing-page.spec.tsx landing-navbar.spec.tsx hero-section.spec.tsx features-section.spec.tsx pricing-section.spec.tsx cta-section.spec.tsx --run
```

There is no standalone Not-found spec; keep the Not-found change visual-only and preserve its existing route behavior. Do not create a new route fixture solely for styling.

- [ ] **Step 3: Implement the marketing rhythm**

Keep the green Casso anchor and current copy, but give the hero one strong visual focal point, keep the product showcase framed, reduce over-wide empty gaps between sections, and make pricing/CTA cards scan in a consistent rhythm. Use existing Framer Motion variants and `useReducedMotion`; do not introduce new animation patterns. Make Not-found keep its current gradient/grid identity while tightening the 404 focal card and actions.

- [ ] **Step 4: Run focused tests, type-check, and scoped Biome**

```bash
pnpm --filter @casso-ledger/frontend test -- landing-page.spec.tsx landing-navbar.spec.tsx hero-section.spec.tsx features-section.spec.tsx pricing-section.spec.tsx cta-section.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/features/landing apps/frontend/src/features/errors/not-found-page.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing apps/frontend/src/features/errors/not-found-page.tsx
git commit -m "feat: polish landing and not-found surfaces"
```

## Final Wave 3 Verification

- [ ] Run the full frontend suite:

```bash
pnpm --filter @casso-ledger/frontend test
```

- [ ] Run frontend type-check and production build:

```bash
pnpm --filter @casso-ledger/frontend type-check
pnpm --filter @casso-ledger/frontend build
```

- [ ] Run scoped formatting/lint checks:

```bash
pnpm exec biome check apps/frontend/src/components/layout/admin-layout.tsx apps/frontend/src/components/layout/auth-status-card.tsx apps/frontend/src/features/copilot apps/frontend/src/features/admin apps/frontend/src/features/auth apps/frontend/src/features/onboarding apps/frontend/src/features/landing apps/frontend/src/features/errors/not-found-page.tsx
```

- [ ] Run repository verification:

```bash
pnpm verify
```

- [ ] Review populated, empty, loading, error, locked, and auth states at 375px, 768px, 1280px, and 1920px, then run:

```bash
git diff --check
git status --short --branch
```
