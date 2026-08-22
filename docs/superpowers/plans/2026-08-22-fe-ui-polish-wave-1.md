# FE UI Polish Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authenticated shell and high-traffic finance screens feel balanced, colorful, and consistent without changing product behavior.

**Architecture:** Improve the existing shared layout and shadcn-style primitives first, then migrate Dashboard, Customers, Receivables, and Reports to the shared visual contract. Add one reusable `EmptyState` primitive because the same empty-state pattern appears in more than three places; keep page-specific data flow and existing query/API contracts unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix/shadcn primitives, Lucide icons, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-fe-ui-polish-design.md`

## Global Constraints

- Work directly on the user-selected `main` worktree.
- No backend, API, domain, database, or routing changes.
- Do not add a UI library, font dependency, chart library, or icon library.
- Keep Be Vietnam Pro and reuse installed Tailwind, shadcn primitives, Lucide icons, and existing CSS variables.
- No invented data to make an empty page look full.
- Preserve existing URLs, permissions, API calls, and business behavior.
- Decorative icons use `aria-hidden="true"`; icon-only controls retain accessible labels.
- Preserve visible `focus-visible` styles and reduced-motion behavior.
- Validate responsive layouts at 375px, 768px, 1280px, and 1920px.
- User-visible copy remains Vietnamese except for existing brand/product terms such as Copilot.

## File Map

| Responsibility | Files |
| --- | --- |
| Shell canvas and content width | `apps/frontend/src/index.css`, `apps/frontend/src/components/layout/app-layout.tsx` |
| Page heading/icon tone contract | `apps/frontend/src/components/layout/header-icon.tsx`, `page-heading.tsx`, `page-header.tsx` |
| Reusable empty states | `apps/frontend/src/components/layout/empty-state.tsx` |
| Shared surface density | `apps/frontend/src/components/ui/card.tsx`, `components/metric-card.tsx`, `components/layout/section-card.tsx`, `components/ui/table.tsx` |
| Dashboard | `apps/frontend/src/features/dashboard/pages/dashboard-page.tsx`, existing dashboard components/specs |
| Customers | `apps/frontend/src/features/customers/pages/customers-page.tsx`, `customer-detail-page.tsx`, `customer-table.tsx`, related specs |
| Receivables | `apps/frontend/src/features/receivables/pages/receivables-page.tsx`, `receivable-detail-page.tsx`, `receivable-table.tsx`, related specs |
| Reports | `apps/frontend/src/features/reports/pages/reports-page.tsx`, `components/dashboard-summary.tsx`, related specs |

## Task 1: Establish the shell canvas and heading/icon tone contract

**Files:**

- Modify: `apps/frontend/src/index.css`
- Modify: `apps/frontend/src/components/layout/app-layout.tsx`
- Modify: `apps/frontend/src/components/layout/header-icon.tsx`
- Modify: `apps/frontend/src/components/layout/page-heading.tsx`
- Modify: `apps/frontend/src/components/layout/page-header.tsx`
- Test: `apps/frontend/src/components/layout/app-layout.spec.tsx`
- Test: `apps/frontend/src/components/layout/page-heading.spec.tsx`
- Test: create `apps/frontend/src/components/layout/header-icon.spec.tsx`

**Interfaces:**

- `HeaderIcon` accepts `tone?: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'ai'`, defaulting to `'brand'`.
- `PageHeading` and `PageHeader` accept the same optional `tone` and pass it to `HeaderIcon`.
- Add CSS theme tokens `--app-canvas` and `--color-app-canvas`; keep existing primary, info, success, warning, destructive, and chart token values intact.

- [ ] **Step 1: Add failing shared-component assertions**

Add tests that render a `PageHeading` with `tone="info"` and a `HeaderIcon` with `tone="warning"`, then assert the rendered icon well contains the expected semantic utility classes. Add an `AppLayout` assertion that the `main` region still exists and renders the outlet after the wrapper change.

```tsx
render(<PageHeading eyebrow="BÁO CÁO" title="Báo cáo" icon={BarChart3} tone="info" />);
expect(screen.getByRole('heading', { name: 'Báo cáo' })).toBeInTheDocument();
expect(screen.getByTestId('header-icon')).toHaveClass('text-info');
```

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- page-heading.spec.tsx header-icon.spec.tsx app-layout.spec.tsx --run
```

Expected: the new tone test fails because `HeaderIcon` does not yet expose a tone contract.

- [ ] **Step 3: Implement the smallest shared visual contract**

Use a tone map in `header-icon.tsx` and keep all icons decorative:

```tsx
export type HeaderIconTone =
  | 'brand'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ai';

const TONE_CLASSES: Record<HeaderIconTone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
  ai: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
};
```

Add `data-testid="header-icon"` only if the existing test environment needs a stable test target; otherwise query the icon well by role/label without adding test-only markup. Update `PageHeading`/`PageHeader` to use the shared tone and `text-pretty` on descriptions.

Wrap the authenticated outlet in `AppLayout` with a centered `max-w-[1600px]` content frame and add the new light canvas token. Keep the skip link target on the `main` element and do not add a second scroll container.

- [ ] **Step 4: Run focused tests and type-check**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- page-heading.spec.tsx header-icon.spec.tsx app-layout.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
```

Expected: all focused tests pass and type-check exits 0.

- [ ] **Step 5: Commit the shared foundation**

```bash
git add apps/frontend/src/index.css apps/frontend/src/components/layout/app-layout.tsx apps/frontend/src/components/layout/header-icon.tsx apps/frontend/src/components/layout/header-icon.spec.tsx apps/frontend/src/components/layout/page-heading.tsx apps/frontend/src/components/layout/page-heading.spec.tsx apps/frontend/src/components/layout/page-header.tsx apps/frontend/src/components/layout/app-layout.spec.tsx
git commit -m "refactor: establish shared FE visual foundation"
```

## Task 2: Add the reusable EmptyState primitive and migrate the finance list states

**Files:**

- Create: `apps/frontend/src/components/layout/empty-state.tsx`
- Test: create `apps/frontend/src/components/layout/empty-state.spec.tsx`
- Modify: `apps/frontend/src/features/customers/components/customer-table.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-table.tsx`
- Modify: `apps/frontend/src/features/dashboard/components/recent-activity-feed.tsx`
- Modify: `apps/frontend/src/features/dashboard/pages/dashboard-page.tsx`
- Test: existing corresponding specs for the migrated components/pages

**Interfaces:**

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  density?: 'compact' | 'default';
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
```

- [ ] **Step 1: Write the failing primitive test**

Test the title, optional description/action, decorative icon, and both density classes. The test must verify that an action is rendered as the supplied button/link, not recreated inside the primitive.

```tsx
render(
  <EmptyState
    icon={Users}
    title="Chưa có khách hàng"
    description="Tạo khách hàng đầu tiên để bắt đầu theo dõi công nợ."
    action={<button type="button">Thêm khách hàng</button>}
  />,
);

expect(screen.getByText('Chưa có khách hàng')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Thêm khách hàng' })).toBeInTheDocument();
expect(screen.getByTestId('empty-state-icon')).toHaveAttribute('aria-hidden', 'true');
```

- [ ] **Step 2: Run the primitive test and verify it fails**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- empty-state.spec.tsx --run
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal primitive**

Render a centered dashed surface. Keep the copy left to the caller, use `aria-hidden="true"` on the icon, and use only explicit spacing transitions already supported by the project.

```tsx
<div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-center', density === 'compact' ? 'min-h-28 gap-2 p-4' : 'min-h-40 gap-3 p-6')}>
  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
    <Icon aria-hidden="true" data-testid="empty-state-icon" className="size-5" />
  </div>
  <div className="max-w-md space-y-1">
    <p className="font-medium text-foreground">{title}</p>
    {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
  </div>
  {action ? <div>{action}</div> : null}
</div>
```

- [ ] **Step 4: Migrate only existing empty branches**

Replace plain empty paragraphs in customer rows, receivable rows, recent activity, and Dashboard's “top overdue customers” block. Do not change query conditions or add new fetches. Preserve existing test-visible copy unless the test is updated to the clearer title/description pair.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- empty-state.spec.tsx customer-table.spec.tsx receivable-table.spec.tsx recent-activity-feed.spec.tsx dashboard-page.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
```

Then commit:

```bash
git add apps/frontend/src/components/layout/empty-state.tsx apps/frontend/src/components/layout/empty-state.spec.tsx apps/frontend/src/features/customers/components/customer-table.tsx apps/frontend/src/features/receivables/components/receivable-table.tsx apps/frontend/src/features/dashboard/components/recent-activity-feed.tsx apps/frontend/src/features/dashboard/pages/dashboard-page.tsx apps/frontend/src/features/customers/components/customer-table.spec.tsx apps/frontend/src/features/receivables/components/receivable-table.spec.tsx apps/frontend/src/features/dashboard/components/recent-activity-feed.spec.tsx apps/frontend/src/features/dashboard/pages/dashboard-page.spec.tsx
git commit -m "feat: add consistent finance empty states"
```

## Task 3: Tighten shared card and table density

**Files:**

- Modify: `apps/frontend/src/components/ui/card.tsx`
- Modify: `apps/frontend/src/components/metric-card.tsx`
- Modify: `apps/frontend/src/components/layout/section-card.tsx`
- Modify: `apps/frontend/src/components/ui/table.tsx`
- Test: create `apps/frontend/src/components/metric-card.spec.tsx`
- Test: existing component/page specs that render these primitives

**Interfaces:**

- Keep all existing component props and exports unchanged.
- `MetricCard.variant` remains `'default' | 'success' | 'warning' | 'danger'`.
- The visual change is implemented through class defaults and existing `className` overrides, not a new density API.

- [ ] **Step 1: Write the failing MetricCard tone assertion**

Add a focused `MetricCard` test that renders the existing success variant and verifies its label/value/description plus the success label tone. This deliberately fails before the tone-aware label map exists; table headers continue to be covered by the existing page/component tests.

```tsx
render(
  <MetricCard
    label="Đã thu"
    description="Tổng tiền đã thu"
    value="30.000.000 ₫"
    icon={CircleDollarSign}
    variant="success"
  />,
);

expect(screen.getByText('Đã thu')).toHaveClass('text-success');
expect(screen.getByText('30.000.000 ₫')).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused regression tests**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- metric-card.spec.tsx dashboard-page.spec.tsx customers-page.spec.tsx receivables-page.spec.tsx reports-page.spec.tsx --run
```

Expected: the new MetricCard tone assertion fails before the visual implementation; existing page tests pass.

- [ ] **Step 3: Reduce bulk and normalize semantic color**

Change the base Card rhythm from `gap-6 py-6` to the normal density used by the finance workspace, then keep onboarding/marketing cards explicitly spacious where needed. Update `MetricCard` so its label uses a tone-aware class instead of always using `text-primary`:

```tsx
const LABEL_COLORS: Record<MetricCardVariant, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning-foreground',
  danger: 'text-destructive',
};
```

Add `bg-muted/40` to shared table headers, preserve row accessibility/focus behavior, and do not introduce zebra striping unless the existing table already has a row boundary.

- [ ] **Step 4: Re-run focused tests, lint, and type-check**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- dashboard-page.spec.tsx customers-page.spec.tsx receivables-page.spec.tsx reports-page.spec.tsx --run
pnpm exec biome check apps/frontend/src/components/ui/card.tsx apps/frontend/src/components/metric-card.tsx apps/frontend/src/components/layout/section-card.tsx apps/frontend/src/components/ui/table.tsx
pnpm --filter @casso-ledger/frontend type-check
```

- [ ] **Step 5: Commit the density pass**

```bash
git add apps/frontend/src/components/ui/card.tsx apps/frontend/src/components/metric-card.tsx apps/frontend/src/components/metric-card.spec.tsx apps/frontend/src/components/layout/section-card.tsx apps/frontend/src/components/ui/table.tsx
git commit -m "refactor: normalize FE card and table density"
```

## Task 4: Polish Dashboard layout and page hierarchy

**Files:**

- Modify: `apps/frontend/src/features/dashboard/pages/dashboard-page.tsx`
- Modify: `apps/frontend/src/features/dashboard/pages/dashboard-page.spec.tsx`
- Modify: `apps/frontend/src/features/dashboard/components/overdue-donut-chart.tsx` only if the empty-state surface requires the existing chart fallback to accept the shared primitive
- Modify: `apps/frontend/src/features/dashboard/components/payment-activity-chart.tsx` only if its existing empty branch needs the shared primitive

**Interfaces:**

- Dashboard query hooks and response types remain unchanged.
- Keep all existing metric labels, chart props, and retry handlers.
- Use `PageHeading` with `icon={LayoutDashboard}` and `tone="brand"`.

- [ ] **Step 1: Add failing assertions for the shared heading and chart grouping**

Assert the Dashboard heading remains one `h1`, the four KPI labels render, and the “Tỷ lệ quá hạn”/“Xu hướng công nợ 6 tháng” sections remain present after the layout grouping change.

- [ ] **Step 2: Run the Dashboard test and verify the new heading assertion fails**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- dashboard-page.spec.tsx --run
```

Expected: FAIL only for the new icon/tone expectation.

- [ ] **Step 3: Implement the balanced Dashboard structure**

Use the shared heading icon, put the welcome/pending-review content in a compact tinted intro block, and group the first chart row into a responsive grid without changing chart data:

```tsx
<div className="rounded-xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
  <h2 className="text-lg font-semibold tracking-tight text-foreground">
    Chào mừng <span className="text-primary">{organizationName}</span>
  </h2>
  <PendingReviewBanner pendingCount={pendingCount} />
</div>

<div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
  {/* trend card */}
  {/* overdue distribution card */}
</div>
```

Keep the payment chart and the recent-activity/top-overdue pair below it. Use the shared `EmptyState` only where the data is already empty; keep retry buttons for query errors.

- [ ] **Step 4: Run Dashboard tests and verify at the target widths**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- dashboard-page.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
```

Visually inspect 375px, 1280px, and 1920px. Confirm the intro block wraps without pushing actions off-screen and charts do not become unreadably short.

- [ ] **Step 5: Commit Dashboard polish**

```bash
git add apps/frontend/src/features/dashboard/pages/dashboard-page.tsx apps/frontend/src/features/dashboard/pages/dashboard-page.spec.tsx apps/frontend/src/features/dashboard/components/overdue-donut-chart.tsx apps/frontend/src/features/dashboard/components/payment-activity-chart.tsx
git commit -m "feat: polish dashboard visual hierarchy"
```

## Task 5: Polish Customers and Receivables list/detail surfaces

**Files:**

- Modify: `apps/frontend/src/features/customers/pages/customers-page.tsx`
- Modify: `apps/frontend/src/features/customers/pages/customer-detail-page.tsx`
- Modify: `apps/frontend/src/features/receivables/pages/receivables-page.tsx`
- Modify: `apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-filters.tsx`
- Modify: `apps/frontend/src/features/customers/components/customer-table.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-table.tsx`
- Test: existing Customers and Receivables page/detail/component specs

**Interfaces:**

- Keep `useCustomers`, `useReceivables`, bulk selection, export, import, and dialog props unchanged.
- Keep all customer/receivable URLs, query parameters, permissions, and pagination behavior unchanged.
- Use `PageHeading` tones: customers `info`, receivables `brand`; keep the existing `Receipt` detail icon.

- [ ] **Step 1: Add regression assertions for list headings, filters, and empty state**

Extend existing page specs to assert the page heading and current search/filter controls remain available. Add no assertions on CSS class implementation.

- [ ] **Step 2: Run the focused tests before the visual changes**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- customers-page.spec.tsx customer-detail-page.spec.tsx receivables-page.spec.tsx receivable-detail-page.spec.tsx customer-table.spec.tsx receivable-table.spec.tsx --run
```

- [ ] **Step 3: Group toolbars and tune finance density**

For Customers, place the search control in a compact bordered toolbar surface and keep pagination visually attached to the table. For Receivables, group search and status filters into the same surface while leaving export/import/create actions in the heading action slot. Use `overflow-hidden` on table section cards so rounded surfaces clip table backgrounds cleanly.

Use a semantic status tone map for receivable filters and badges; status text must remain present so color is never the only signal.

- [ ] **Step 4: Add section icon wells and detail hierarchy**

Keep the recent receivable-detail progress/info design, but pass the shared heading tone. Add consistent section icons to Customer Detail cards where the card already has a clear domain meaning; do not add icons to every row or duplicate information already in the heading.

Replace remaining plain list empty paragraphs in these flows with `EmptyState` using existing copy plus one concise explanation. Do not add a CTA where the current screen has no existing action.

- [ ] **Step 5: Run focused tests, type-check, and commit**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- customers-page.spec.tsx customer-detail-page.spec.tsx receivables-page.spec.tsx receivable-detail-page.spec.tsx customer-table.spec.tsx receivable-table.spec.tsx --run
pnpm --filter @casso-ledger/frontend type-check
pnpm exec biome check apps/frontend/src/features/customers apps/frontend/src/features/receivables
```

Commit:

```bash
git add apps/frontend/src/features/customers apps/frontend/src/features/receivables
git commit -m "feat: polish customer and receivable surfaces"
```

## Task 6: Polish Reports and finish Wave 1 verification

**Files:**

- Modify: `apps/frontend/src/features/reports/pages/reports-page.tsx`
- Modify: `apps/frontend/src/features/reports/components/dashboard-summary.tsx`
- Modify: `apps/frontend/src/features/reports/components/customer-aging-filters.tsx` only if the toolbar grouping requires it
- Test: `apps/frontend/src/features/reports/pages/reports-page.spec.tsx`
- Test: existing report component specs

**Interfaces:**

- Keep `useDashboardSummary`, `useAgingReport`, `useCustomerAging`, and `useReportsTrend` calls unchanged.
- Keep URL-backed `agingSearch`, `agingBucket`, `agingPage`, and `trendMonths` behavior unchanged.
- Use `PageHeading` tone `info` and keep the existing CSV export action.

- [ ] **Step 1: Add assertions for heading, chart sections, and the empty aging result**

Extend the existing report page spec so it verifies the page still exposes the main heading, the aging sections, and the empty customer-aging message when the query returns no rows.

- [ ] **Step 2: Run report tests before implementation**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- reports-page.spec.tsx reports-trend-chart.spec.tsx aging-chart.spec.tsx --run
```

- [ ] **Step 3: Implement report hierarchy**

Use compact summary cards, colored section icons, balanced chart widths, and a single toolbar surface for customer-aging search/filter. Replace the plain no-data paragraph with `EmptyState` while keeping the existing URL-backed filters and pagination.

Use `tabular-nums` for aging amounts and keep chart fallbacks as live status text.

- [ ] **Step 4: Run Wave 1 verification**

Run:

```bash
pnpm --filter @casso-ledger/frontend test
pnpm --filter @casso-ledger/frontend type-check
pnpm --filter @casso-ledger/frontend build
pnpm exec biome check apps/frontend/src/components apps/frontend/src/features/dashboard apps/frontend/src/features/customers apps/frontend/src/features/receivables apps/frontend/src/features/reports
pnpm verify
```

Expected: frontend tests, type-check, build, and scoped Biome checks pass. If the repository-wide verify still reports the known pre-existing formatting issue in `apps/frontend/src/features/landing/components/product-showcase.tsx`, report it separately and do not mix an unrelated cleanup into Wave 1.

- [ ] **Step 5: Review the four target widths and commit the Wave 1 checkpoint**

Review populated, empty, loading, and error states at 375px, 768px, 1280px, and 1920px. Confirm:

- the content column no longer becomes a long full-width strip on desktop;
- headings, descriptions, and actions align without collisions;
- card groups have intentional density and no accidental double padding;
- semantic colors are readable in light and dark themes;
- icons are decorative unless they communicate a status already expressed in text;
- no new animation runs when reduced motion is enabled.

Then commit the final Wave 1 checkpoint:

```bash
git add apps/frontend/src/index.css apps/frontend/src/components apps/frontend/src/features/dashboard apps/frontend/src/features/customers apps/frontend/src/features/receivables apps/frontend/src/features/reports
git commit -m "feat: complete FE UI polish wave 1"
```

## Handoff to Wave 2

After Wave 1 review, create a separate plan for operations/history screens:
Bank Connections, Exceptions, Reminders, Receivable Balance History, and
Settings. Reuse the shared shell, tone map, density rules, table styles, and
`EmptyState` from this plan; do not duplicate them.
