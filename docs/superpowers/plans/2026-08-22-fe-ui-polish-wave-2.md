# FE UI Polish Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish Bank Connections, Exceptions, Reminders, Receivable Balance History, and Settings using the Wave 1 visual contract while preserving all existing frontend behavior.

**Architecture:** Keep the work feature-local and compose the shared Wave 1 layout primitives instead of adding new global components. Dispatch three independent tasks: operations, automation/admin, and history; each task owns disjoint files and its existing tests.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix/shadcn primitives, Lucide icons, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-fe-ui-polish-wave-2-design.md`

## Global Constraints

- Work directly on the user-selected `main` worktree.
- No backend, API, domain, database, routing, or dependency changes.
- Reuse existing Wave 1 `PageHeading`, `PageHeader`, `HeaderIcon`, `SectionCard`, `Card`, `Table`, and `EmptyState` primitives.
- Preserve URLs, query parameters, permissions, API calls, mutation behavior, keyboard focus, reduced-motion behavior, and dark-mode readability.
- No invented records, metrics, or decorative filler content.
- User-visible copy remains Vietnamese except existing product terms.
- Status colors are semantic and always paired with text, badges, or icons.
- Validate responsive layouts at 375px, 768px, 1280px, and 1920px.

## File Map

| Task | Files owned | Deliverable |
| --- | --- | --- |
| Operations | `apps/frontend/src/features/bank-connections/**`, `apps/frontend/src/features/exceptions/**` | Clear connection/review states and table/action hierarchy |
| Automation/admin | `apps/frontend/src/features/reminders/**`, `apps/frontend/src/features/settings/**` | Distinct reminder workflows and balanced settings surfaces |
| History | `apps/frontend/src/features/receivable-balance-history/**` | KPI → chart → filter → table composition with readable states |

## Task 1: Polish Bank Connections and Exceptions

**Files:**

- Modify: `apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx`
- Modify: `apps/frontend/src/features/bank-connections/components/connection-table.tsx`
- Modify: `apps/frontend/src/features/bank-connections/components/authorization-history-dialog.tsx`
- Test: `apps/frontend/src/features/bank-connections/components/connection-table.spec.tsx`, `authorization-history-dialog.spec.tsx`, and related API/component specs
- Modify: `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx`
- Modify: `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx`
- Test: existing Exceptions page/component specs

**Interfaces:**

- Keep `usePollConnections`, connection mutation hooks, `hasPermission`, and all dialog props unchanged.
- Keep `usePendingReview`, `useBulkSelection`, URL query parameters, split-match flow, and bulk mutation hooks unchanged.
- Use `PageHeading`/`SectionCard`/`EmptyState`/`HeaderIcon` already present in the shared layout; do not create a new global primitive.

- [ ] **Step 1: Add regression assertions for the state contract**

Extend the existing page/component tests to assert that the bank page still exposes “Kết nối ngân hàng”, the connection table keeps status text and action labels, and Exceptions still exposes search, selection, “Xử lý”, and bulk-action controls. Add assertions for the two distinct empty messages on Exceptions: no records versus no search results.

- [ ] **Step 2: Run the focused tests before visual changes**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- connection-table.spec.tsx authorization-history-dialog.spec.tsx exceptions-page.spec.tsx exceptions-bulk-action-bar.spec.tsx --run
```

Expected: existing behavior passes; any newly added visual/state assertion fails only if the current markup lacks the intended semantic hook.

- [ ] **Step 3: Implement the operations visual hierarchy**

Make the bank page use a domain tone on its heading and give the connection section a compact status-oriented header. Replace the plain bank empty paragraph with `EmptyState` using `Landmark`, a concise Vietnamese explanation, and the existing connect action only when the caller can perform it. Map connection statuses to existing `Badge` variants/classes while retaining the status label text. Keep grouped authorization actions in a wrapping toolbar row above each group and give the table cells stable min/max widths so bank names and account numbers do not force the action column off-screen.

For Exceptions, group the search input with the table surface, add a small warning/info cue to the review queue, make selected-row/bulk-action spacing explicit, and replace the plain empty paragraph with `EmptyState` using `FileSearch`. Preserve the search-specific title and do not change pagination or selection logic.

- [ ] **Step 4: Run focused tests, type-check, and format checks**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- bank-connections-page.spec.tsx connection-table.spec.tsx authorization-history-dialog.spec.tsx exceptions-page.spec.tsx exceptions-bulk-action-bar.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/features/bank-connections apps/frontend/src/features/exceptions
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the operations polish**

```bash
git add apps/frontend/src/features/bank-connections apps/frontend/src/features/exceptions
git commit -m "feat: polish bank connections and exception queue"
```

## Task 2: Polish Reminders and Settings

**Files:**

- Modify: `apps/frontend/src/features/reminders/pages/reminders-page.tsx`
- Modify: `apps/frontend/src/features/reminders/components/policy-table.tsx`
- Modify: `apps/frontend/src/features/reminders/components/executions-table.tsx`
- Modify: `apps/frontend/src/features/reminders/components/policy-dialog.tsx`
- Test: existing Reminders page/component specs
- Modify: `apps/frontend/src/features/settings/pages/settings-page.tsx`
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/email-templates-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/smtp-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/appearance-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/billing-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/pending-invites-table.tsx`
- Test: `apps/frontend/src/features/settings/components/billing-tab.spec.tsx`, `users-tab.spec.tsx`, `email-templates-tab.spec.tsx`, `smtp-tab.spec.tsx`, and related dialog/table specs

**Interfaces:**

- Keep reminder query/mutation hooks, policy dialog fields, and permission checks unchanged.
- Keep settings tab query parameters, plan gates, permission gates, member/template/SMTP/billing mutations, and dialog behavior unchanged.
- Use existing section/card/icon primitives and feature-local composition only.

- [ ] **Step 1: Add regression assertions for reminder and settings structure**

Extend existing specs to assert the reminder page exposes both “Chính sách nhắc” and “Lịch sử thực thi”, the execution filter remains available, and policy/execution status text remains visible. Extend settings specs to assert the tab list, locked-tab indicators, member invite controls, and SMTP/billing actions remain available under their existing permissions and plan fixtures.

- [ ] **Step 2: Run focused tests before visual changes**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- reminders-page.spec.tsx policy-table.spec.tsx policy-dialog.spec.tsx billing-tab.spec.tsx users-tab.spec.tsx email-templates-tab.spec.tsx smtp-tab.spec.tsx --run
```

- [ ] **Step 3: Implement reminder workflow hierarchy**

Give the policy and execution sections different existing semantic tones (`success`/`info` for healthy automation and `warning`/`danger` for attention states). Put the execution filter in a responsive toolbar above the table. Use compact `EmptyState` instances with `Bell` and `History` for the two empty arrays, and use text-plus-badge treatment for active policy and execution statuses. Keep create/edit actions in the page heading and preserve the URL-backed receivable filter.

- [ ] **Step 4: Implement settings hierarchy and density**

Align the settings page heading with the shared `PageHeading`/`HeaderIcon` rhythm and keep the tab strip horizontally scrollable on narrow screens. Give Users, email templates, SMTP, appearance, and billing surfaces clear section icons or icon wells where the component already has a heading. Wrap the member invite controls into a labeled toolbar, make table action groups wrap cleanly, replace plain empty paragraphs with existing `EmptyState` where appropriate, and use semantic card accents for plan/current status and SMTP connection state. Do not alter conditional rendering or mutation calls.

- [ ] **Step 5: Run focused tests, type-check, and format checks**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- reminders-page.spec.tsx policy-table.spec.tsx policy-dialog.spec.tsx billing-tab.spec.tsx users-tab.spec.tsx email-templates-tab.spec.tsx smtp-tab.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/features/reminders apps/frontend/src/features/settings
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the automation/admin polish**

```bash
git add apps/frontend/src/features/reminders apps/frontend/src/features/settings
git commit -m "feat: polish reminders and settings surfaces"
```

## Task 3: Polish Receivable Balance History

**Files:**

- Modify: `apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.tsx`
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-kpis.tsx`
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-filters.tsx`
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-table.tsx`
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-charts.tsx`
- Test: existing Receivable Balance History page/API/component specs

**Interfaces:**

- Keep `useReceivableBalanceHistory`, `useReceivableBalanceHistorySummary`, CSV export, `useUrlQueryParams`, all filter names, pagination, and lazy chart loading unchanged.
- Keep `ReceivableBalanceHistorySummary`, filter values, table item types, and chart props unchanged.

- [ ] **Step 1: Add regression assertions for page order and controls**

Extend the page spec to assert the heading, CSV action, KPI labels, filter controls, table/empty message, and pagination controls remain available. Assert the default date window and URL-backed filter names through the existing test fixtures rather than adding new API behavior.

- [ ] **Step 2: Run the focused history tests before visual changes**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- receivable-balance-history-page.spec.tsx receivable-balance-history-api.spec.ts --run
```

The hook contract is covered through the page/API specs; do not add a new hook test just for visual changes.

- [ ] **Step 3: Implement the balanced history composition**

Remove the extra page-level `p-6` where the authenticated shell already supplies the content frame. Keep the visual order as heading → KPI cards → lazy charts → filter surface → table section → pagination. Add semantic tones and small icon wells to KPI cards, give the filter group a bordered responsive toolbar, and make chart/table cards share the same radius, border, and internal padding. Use `EmptyState` for the no-results branch with `History`, while preserving the existing filter values and CSV action.

- [ ] **Step 4: Run focused tests, type-check, and format checks**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- receivable-balance-history-page.spec.tsx receivable-balance-history-api.spec.ts --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/features/receivable-balance-history
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the history polish**

```bash
git add apps/frontend/src/features/receivable-balance-history
git commit -m "feat: polish receivable balance history"
```

## Final Wave 2 Verification

- [ ] Run the full frontend suite:

```bash
pnpm --filter @casso-ledger/frontend test
```

- [ ] Run type-check and production build:

```bash
pnpm --filter @casso-ledger/frontend type-check
pnpm --filter @casso-ledger/frontend build
```

- [ ] Run scoped formatting/lint checks:

```bash
pnpm exec biome check apps/frontend/src/features/bank-connections apps/frontend/src/features/exceptions apps/frontend/src/features/reminders apps/frontend/src/features/settings apps/frontend/src/features/receivable-balance-history
```

- [ ] Run repository verification:

```bash
pnpm verify
```

Report the known unrelated `apps/frontend/src/features/landing/components/product-showcase.tsx` formatting baseline failure separately if it remains; do not include it in this wave.

- [ ] Review populated, empty, loading, and error states at 375px, 768px, 1280px, and 1920px, then commit the integration checkpoint:

```bash
git add apps/frontend/src/features/bank-connections apps/frontend/src/features/exceptions apps/frontend/src/features/reminders apps/frontend/src/features/settings apps/frontend/src/features/receivable-balance-history
git commit -m "feat: complete FE UI polish wave 2"
```
