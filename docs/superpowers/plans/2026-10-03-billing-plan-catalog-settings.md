# Billing plan catalog in Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Billing plan cards and upgrade actions useful during catalog failures while clearly identifying catalog prices.

**Architecture:** Reuse the existing `usePlans` React Query hook and catalog response. Keep plan IDs, labels, and upgrade order stable in the UI; render catalog values by `planId`, with unavailable values represented by `—`.

**Tech Stack:** React, TanStack Query, Vitest, React Testing Library, pnpm workspace.

## Global Constraints

- Prices and limits come from `GET /api/v1/plans`; do not add frontend price or limit constants.
- Preserve the FREE → STARTER → BUSINESS → ENTERPRISE order, labels, permission checks, and upgrade mutation.
- Leave the existing Copilot limit row unchanged on successful loads; do not add more Copilot plan content.
- Retain cached catalog values after a failed refresh and make their stale state visible.
- Use the agreed public seam: rendered `BillingTab` behavior with `usePlans` mocked.
- Follow RED → GREEN for each behavior; do not add dependencies or change backend code.

---

### Task 1: Label catalog prices

**Files:**
- Modify: `apps/frontend/src/features/settings/components/billing-tab.spec.tsx`
- Modify: `apps/frontend/src/features/settings/components/billing-tab.tsx`

**Interfaces:**
- Consumes: `PlanCatalogEntry[]` returned by the existing `usePlans` hook.
- Produces: Each plan card identifies its catalog amount with the visible label `Giá gói`.

- [ ] **Step 1: Write a failing component test**

In the existing successful catalog-render test, assert the agreed label on each card and explicitly cover ENTERPRISE's catalog values:

```tsx
expect(screen.getAllByText('Giá gói')).toHaveLength(4);
expect(screen.getAllByText('Miễn phí')).toHaveLength(2);
expect(screen.getByText(/299\.000/)).toBeInTheDocument();
expect(screen.getByText(/^999\.000/)).toBeInTheDocument();
expect(screen.getByText(/2\.999\.000/)).toBeInTheDocument();
const metricLines = screen.getAllByRole('listitem').map((item) => item.textContent);
expect(metricLines).toContain('50 khoản phải thu/tháng');
expect(metricLines).toContain('500 khoản phải thu/tháng');
expect(metricLines).toContain('5.000 khoản phải thu/tháng');
expect(metricLines).toContain('15.000 khoản phải thu/tháng');
expect(metricLines).toContain('1 kết nối ngân hàng');
expect(metricLines).toContain('2 kết nối ngân hàng');
expect(metricLines).toContain('5 kết nối ngân hàng');
expect(metricLines).toContain('10 kết nối ngân hàng');
expect(screen.queryByText('Không giới hạn số kết nối ngân hàng'))
  .not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`

Expected: the test fails because the Billing cards do not yet render `Giá gói`.

- [ ] **Step 3: Add the minimal label**

Render a small `Giá gói` label in each card above its existing price. Keep FREE as `Miễn phí`; keep paid values formatted by `formatVND` with `/tháng`.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`

Expected: the price-label assertion and the existing catalog display assertions pass.

- [ ] **Step 5: Commit the completed slice**

Run:

```powershell
git add apps/frontend/src/features/settings/components/billing-tab.spec.tsx apps/frontend/src/features/settings/components/billing-tab.tsx
git commit -m "fix: label billing plan catalog prices"
```

### Task 2: Preserve cards and upgrade controls on a cold catalog failure

**Files:**
- Modify: `apps/frontend/src/features/settings/components/billing-tab.spec.tsx`
- Modify: `apps/frontend/src/features/settings/components/billing-tab.tsx`

**Interfaces:**
- Consumes: Static plan IDs/order, the current user and permission, and optional query data/error/refetch state.
- Produces: Four stable plan cards, visible unavailable-value placeholders, an alert with retry, and usable upgrade buttons when the query has no data.

- [ ] **Step 1: Write a failing public-UI regression test**

Mock `usePlans` with `data: undefined`, `isLoading: false`, `isError: true`, and a `refetch` spy. Render as an OWNER on FREE. Assert the alert and retry action are visible, all four localized plan labels remain visible, the three upgrade buttons remain available, and clicking the first upgrade button calls the existing mutation with `targetPlanId: 'STARTER'`.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`

Expected: it fails because the current no-catalog branch returns only the error alert and removes plan cards and upgrade buttons.

- [ ] **Step 3: Render stable cards with optional catalog details**

Build `catalogById` from `catalog ?? []`. Map the static ordered plan IDs to cards without filtering out entries whose details are missing. Render `—` for catalog-backed price and numeric limits when details are absent. Keep static labels, feature copy, permission gating, and upgrade handling intact. Show the cold-failure alert and call `refetch()` from its `Thử lại` button.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`

Expected: all four cards render, and upgrade checkout remains reachable despite the failed catalog request.

- [ ] **Step 5: Commit the completed slice**

Run:

```powershell
git add apps/frontend/src/features/settings/components/billing-tab.spec.tsx apps/frontend/src/features/settings/components/billing-tab.tsx
git commit -m "fix: keep upgrades available on plan fetch errors"
```

### Task 3: Mark cached data when a refresh fails

**Files:**
- Modify: `apps/frontend/src/features/settings/components/billing-tab.spec.tsx`
- Modify: `apps/frontend/src/features/settings/components/billing-tab.tsx`

**Interfaces:**
- Consumes: Non-empty cached catalog data together with the query's error state and `refetch` callback.
- Produces: Existing cached prices/limits remain visible with a compact stale-data alert and retry action.

- [ ] **Step 1: Write a failing cached-data test**

Mock `usePlans` with `data: planCatalog`, `isLoading: false`, `isError: true`, and a `refetch` spy. Assert a stale-data warning is visible, a known paid price and its limits remain visible, and clicking `Thử lại` calls `refetch`.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`

Expected: cached data renders, but no warning or retry action currently appears.

- [ ] **Step 3: Add the non-blocking stale-data alert**

When `isError` and the catalog is non-empty, render a compact alert explaining that previously loaded plan information is being shown and include the same retry action. Do not remove cards or cached numbers.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`

Expected: the warning, cached figures, retry action, and existing upgrade behavior all pass.

- [ ] **Step 5: Commit the completed slice**

Run:

```powershell
git add apps/frontend/src/features/settings/components/billing-tab.spec.tsx apps/frontend/src/features/settings/components/billing-tab.tsx
git commit -m "fix: report stale billing plan catalog data"
```

### Task 4: Verify the issue and review the diff

**Files:**
- Review: `apps/frontend/src/features/settings/components/billing-tab.tsx`
- Review: `apps/frontend/src/features/settings/components/billing-tab.spec.tsx`
- Review: `GLOSSARY.md`

- [ ] Run focused component tests: `pnpm --filter @casso-ar/frontend test -- src/features/settings/components/billing-tab.spec.tsx`.
- [ ] Run the full frontend suite: `pnpm --filter @casso-ar/frontend test`.
- [ ] Run frontend type-check: `pnpm --filter @casso-ar/frontend type-check`.
- [ ] Run repository verification: `pnpm verify`.
- [ ] Review the final diff for hardcoded production prices/limits, regressions to plan ordering/permissions, and unrelated changes.

## Review Focus

- Cold errors must keep all four static plan identities and preserve permission/current-plan upgrade eligibility.
- A query error with cached data must not hide cards or misrepresent cached values as current.
- A partial catalog must not remove a plan card or its otherwise-valid upgrade action.
- No production price or limit values may be duplicated in frontend source.
