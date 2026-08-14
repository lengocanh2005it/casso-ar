# Reports Customer Aging and Historical Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable, bucket-filtered customer aging report and a 3/6/12-month outstanding/collected trend to the existing Reports page.

**Architecture:** Extend the existing reporting Clean Architecture module with two read-only query services and parameterized PostgreSQL repositories. Customer aging reads current persisted receivable rollups; trend reads monthly payments plus the history query port supplied by prerequisite issue #172. The frontend adds two focused report sections and keeps their state in URL search parameters.

**Tech Stack:** NestJS 11, TypeORM raw parameterized PostgreSQL queries, Jest/Testcontainers, React 19, TanStack Query, React Router, Recharts, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-14-reports-customer-aging-and-trend-design.md`

## Global Constraints

- #172 must be implemented and verified before the historical `outstanding` trend endpoint is enabled.
- All money values remain integer VND values; no float/decimal money representation.
- Every query is tenant-scoped by `TenantContextService.getOrganizationId()` / `organizationId`.
- Do not reconstruct historical balances with `SUM(payment_allocations)` at runtime.
- Reuse `Permission.REPORT_READ`, `JwtAuthGuard`, `PermissionGuard`, and `@RequirePermission`.
- Controllers only parse validated DTOs and call application services.
- Application ports must not import concrete infrastructure/SDK libraries.
- Raw SQL must select explicit columns, use parameters, and map rows explicitly.
- No external calls occur inside report queries or history transactions.
- New list inputs use `page` default `1`, `limit` default `20`, maximum `100`.
- Follow RED → GREEN → REFACTOR for every behavior change and keep tests beside source or in `apps/backend/test/` for integration coverage.
- Before backend completion, run `/domain-check`; before completion claims, run fresh focused tests, relevant full tests, `pnpm verify`, and the affected reporting e2e suite.

## Dependency Contract with #172

The #135 implementation starts only after #172 exposes an application-layer query port with this behavior:

```ts
export interface HistoricalOutstandingPoint {
  month: string; // YYYY-MM in Asia/Ho_Chi_Minh
  outstanding: number | null;
}

export interface IReceivableBalanceHistoryQuery {
  findOutstandingByMonthEnds(
    organizationId: string,
    monthEnds: Date[],
  ): Promise<HistoricalOutstandingPoint[]>;
}

export const RECEIVABLE_BALANCE_HISTORY_QUERY = Symbol(
  'RECEIVABLE_BALANCE_HISTORY_QUERY',
);
```

The #172 module exports that provider. It returns `null` for months before history coverage begins. #135 consumes the port and never imports the history ORM entity.

---

### Task 1: Add the customer-aging application contract and query service

**Files:**
- Create: `apps/backend/src/modules/reporting/application/customer-aging-report.repository.port.ts`
- Create: `apps/backend/src/modules/reporting/application/customer-aging-report-query.service.ts`
- Test: `apps/backend/src/modules/reporting/application/customer-aging-report-query.service.spec.ts`

**Interfaces:**

```ts
export interface CustomerAgingFilters {
  page: number;
  limit: number;
  search?: string;
  bucket?: AgingBucket;
}

export interface CustomerAgingBucketAmount {
  bucket: AgingBucket;
  totalRemaining: number;
}

export interface CustomerAgingRow {
  customerId: string;
  customerName: string;
  taxCode: string;
  buckets: CustomerAgingBucketAmount[];
  totalRemaining: number;
}

export interface CustomerAgingPage {
  items: CustomerAgingRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ICustomerAgingReportRepository {
  findPage(
    organizationId: string,
    filters: CustomerAgingFilters,
  ): Promise<CustomerAgingPage>;
}

export const CUSTOMER_AGING_REPORT_REPOSITORY = Symbol(
  'CUSTOMER_AGING_REPORT_REPOSITORY',
);
```

The service exposes `getCustomerAging(filters: CustomerAgingFilters): Promise<CustomerAgingPage>`, obtains the organization ID from `TenantContextService`, and delegates exactly once to the repository.

- [ ] **Step 1: Write the failing tests**

Add tests for:

```ts
it('passes page, limit, search, and bucket with the current tenant', async () => {
  // expect findPage('org-1', { page: 2, limit: 20, search: 'ACME', bucket: 'OVERDUE_60_PLUS' })
});

it('returns the repository page unchanged', async () => {
  // expect the exact repository result
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/backend`:

```bash
pnpm exec jest --runInBand src/modules/reporting/application/customer-aging-report-query.service.spec.ts
```

Expected: FAIL because the port and service do not exist.

- [ ] **Step 3: Implement the smallest contract and service**

Use the existing `AGING_REPORT_REPOSITORY`/`AgingReportQueryService` pattern: inject `CUSTOMER_AGING_REPORT_REPOSITORY` and `TenantContextService`, read `getOrganizationId()`, and call `findPage(organizationId, filters)`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Jest command. Expected: all customer-aging application tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/application/customer-aging-report.repository.port.ts apps/backend/src/modules/reporting/application/customer-aging-report-query.service.ts apps/backend/src/modules/reporting/application/customer-aging-report-query.service.spec.ts
git commit -m "feat: add customer aging report query service"
```

### Task 2: Implement the tenant-scoped customer-aging SQL repository

**Files:**
- Create: `apps/backend/src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.ts`
- Create: `apps/backend/src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.spec.ts`

**Interfaces:**
- Consumes: `ICustomerAgingReportRepository` and `CustomerAgingFilters` from Task 1.
- Produces: `{ items, total, page, limit }` with all five canonical buckets in fixed order.

Use one parameterized query with explicit columns and these CTE stages:

1. `active_receivables`: select customer identity, `originalAmount - paidAmount` as `remaining`, and the canonical bucket for `OPEN`/`PARTIALLY_PAID` rows with positive remaining.
2. Apply the customer search against `customers.name`, `customers.taxCode`, and `customers.phone` before grouping.
3. Pivot grouped bucket totals into explicit `notDue`, `overdue1To7`, `overdue8To30`, `overdue31To60`, `overdue60Plus`, and `totalRemaining` columns.
4. Apply the selected bucket predicate to the grouped totals before `LIMIT/OFFSET`.
5. Use `COUNT(*) OVER()` for the filtered customer count, then sort by total remaining descending, customer name ascending, and customer ID ascending for stable pagination.

The row mapper converts the five pivot columns back to the canonical `buckets` array and converts PostgreSQL bigint strings to numbers. It never returns `organizationId`, ORM entities, or internal fields.

- [ ] **Step 1: Write the failing repository tests**

Mock `DataSource.query` and assert:

```ts
it('passes organization, search, bucket, limit, and offset as parameters', async () => {
  // expect dataSource.query(sql, ['org-1', '%acme%', 'OVERDUE_60_PLUS', 20, 20])
});

it('maps bigint strings and zero-fills all five buckets', async () => {
  // mock one pivot row and expect all five bucket amounts plus totalRemaining
});

it('returns the window count as the page total', async () => {
  // mock totalCount: '42' and expect total: 42
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec jest --runInBand src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.spec.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement the parameterized CTE query and explicit mapper**

Use `@InjectDataSource()` and `DataSource.query`. Keep the `organizationId` predicate in both the receivable and customer joins. Do not use `SELECT *` or a runtime payment-allocation sum.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Jest command. Expected: all repository mapping and parameter assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.ts apps/backend/src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.spec.ts
git commit -m "feat: query customer aging report"
```

### Task 3: Wire and integration-test the customer-aging endpoint

**Files:**
- Create: `apps/backend/src/modules/reporting/presentation/dto/get-customer-aging-query.dto.ts`
- Create: `apps/backend/src/modules/reporting/presentation/dto/get-customer-aging-query.dto.spec.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.spec.ts`
- Modify: `apps/backend/src/modules/reporting/reporting.module.ts`
- Modify: `apps/backend/test/aging-dashboard-reporting.integration.spec.ts`

**Interfaces:**
- Consumes: `AgingBucket`, `CustomerAgingFilters`, and `AgingReportQueryService` patterns from Tasks 1–2.
- Produces: `GET /api/v1/reports/aging/customers` with `REPORT_READ` authorization.

DTO rules:

```ts
page: @Type(() => Number), @IsInt(), @Min(1), default 1
limit: @Type(() => Number), @IsInt(), @Min(1), @Max(100), default 20
search?: @IsOptional(), @IsString(), @MaxLength(MAX_SEARCH_LENGTH)
bucket?: @IsOptional(), @IsIn(AGING_BUCKETS)
```

The controller method calls `getCustomerAging({ page: query.page, limit: query.limit, search: query.search, bucket: query.bucket })` and returns the service result without business logic. Register the repository token and service in `ReportingModule`.

- [ ] **Step 1: Add failing DTO/controller tests**

Add tests that assert:

```ts
it('delegates customer aging filters to the query service', async () => {
  // expect service.getCustomerAging({ page: 2, limit: 20, search: 'ACME', bucket: 'NOT_DUE' })
});

it('requires REPORT_READ on the customer aging route', () => {
  // reflect metadata from ReportsController.prototype.getCustomerAging
});
```

Extend the DTO spec with invalid bucket, page 0, limit 101, and overlong search cases.

- [ ] **Step 2: Run focused unit tests and verify RED**

```bash
pnpm exec jest --runInBand src/modules/reporting/presentation/reports.controller.spec.ts src/modules/reporting/presentation/dto/get-customer-aging-query.dto.spec.ts
```

Expected: FAIL because the DTO, controller method, and provider wiring do not exist.

- [ ] **Step 3: Implement DTO, controller route, and module provider wiring**

Add `@Get('aging/customers')`, `@RequirePermission(Permission.REPORT_READ)`, and the DI registrations. Preserve the existing constructor behavior and tests for `/aging`, `/aging/export`, and `/dashboard-summary`.

- [ ] **Step 4: Run focused unit tests and verify GREEN**

Run the same Jest command. Expected: DTO, controller, and metadata tests pass.

- [ ] **Step 5: Add and run Postgres integration coverage**

Extend the existing reporting integration fixture with a second customer and receivables that exercise multiple buckets. Assert:

- unauthenticated requests return 401;
- search matches name, tax code, and phone;
- bucket filtering returns only customers with a positive amount in that bucket;
- page/limit and total are stable under total-remaining/name ordering;
- a second organization cannot see the fixture rows.

Run from `apps/backend`:

```bash
pnpm exec jest --config ./test/jest-e2e.json --runInBand test/aging-dashboard-reporting.integration.spec.ts
```

Expected: the existing aging/dashboard tests and the new customer-aging assertions pass against Postgres.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/reporting/presentation apps/backend/src/modules/reporting/reporting.module.ts apps/backend/test/aging-dashboard-reporting.integration.spec.ts
git commit -m "feat: expose customer aging report endpoint"
```

### Task 4: Add monthly period calculation and trend application contracts

**Files:**
- Create: `apps/backend/src/modules/reporting/application/trend-report.repository.port.ts`
- Create: `apps/backend/src/modules/reporting/application/trend-report-query.service.ts`
- Create: `apps/backend/src/modules/reporting/application/trend-report-query.service.spec.ts`

**Interfaces:**

```ts
export type TrendMonths = 3 | 6 | 12;

export interface ReportingMonth {
  key: string; // YYYY-MM in Asia/Ho_Chi_Minh
  start: Date;
  end: Date;
  isCurrent: boolean;
}

export interface CollectedPoint {
  month: string;
  collected: number;
}

export interface ReportsTrendPoint {
  month: string;
  outstanding: number | null;
  collected: number;
}

export interface ITrendReportRepository {
  findCollectedByMonths(
    organizationId: string,
    months: ReportingMonth[],
  ): Promise<CollectedPoint[]>;
}

export const TREND_REPORT_REPOSITORY = Symbol('TREND_REPORT_REPOSITORY');
```

The service exposes `getTrend(months: TrendMonths = 12): Promise<{ months: TrendMonths; items: ReportsTrendPoint[] }>` and injects both `TREND_REPORT_REPOSITORY` and the #172 `RECEIVABLE_BALANCE_HISTORY_QUERY` port. It creates month windows using `date-fns-tz` and `Asia/Ho_Chi_Minh`, requests collected points and historical outstanding points, then merges by month while preserving `null` outstanding values and zero-filling missing collected points.

- [ ] **Step 1: Write failing period/service tests**

Add tests with a fixed system time for:

```ts
it.each([3, 6, 12])('returns exactly %i oldest-to-newest monthly points', async (months) => {
  // assert point count, YYYY-MM keys, and current-month inclusion
});

it('defaults to 12 months', async () => {
  // expect the history and collected ports to receive 12 month windows
});

it('keeps null outstanding and zero-fills collected months', async () => {
  // expect [{ outstanding: null, collected: 0 }] for an uncovered/empty month
});

it('passes the current tenant to both dependencies', async () => {
  // expect organizationId === 'org-1'
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec jest --runInBand src/modules/reporting/application/trend-report-query.service.spec.ts
```

Expected: FAIL because the trend contract and service do not exist.

- [ ] **Step 3: Implement the month-window helper and merge service**

Use deterministic `jest.setSystemTime` in tests; do not add a clock abstraction for this read-only query. Ensure the current month ends at query time while completed months end at their local calendar boundary.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Jest command. Expected: all period, tenant, null, and zero-fill assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/application/trend-report.repository.port.ts apps/backend/src/modules/reporting/application/trend-report-query.service.ts apps/backend/src/modules/reporting/application/trend-report-query.service.spec.ts
git commit -m "feat: add reports trend query service"
```

### Task 5: Implement collected-month SQL and trend endpoint wiring

**Files:**
- Create: `apps/backend/src/modules/reporting/infrastructure/typeorm-trend-report.repository.ts`
- Create: `apps/backend/src/modules/reporting/infrastructure/typeorm-trend-report.repository.spec.ts`
- Create: `apps/backend/src/modules/reporting/presentation/dto/get-reports-trend-query.dto.ts`
- Create: `apps/backend/src/modules/reporting/presentation/dto/get-reports-trend-query.dto.spec.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.spec.ts`
- Modify: `apps/backend/src/modules/reporting/reporting.module.ts`
- Modify: `apps/backend/test/aging-dashboard-reporting.integration.spec.ts`

**Interfaces:**
- Consumes: `ITrendReportRepository`, `ReportingMonth`, and the #172 history query port from Task 4.
- Produces: `GET /api/v1/reports/trend?months=3|6|12` with `{ months, items }`.

The repository query groups `payments.totalAmount` by the supplied month ranges using `receivedAt` converted to `Asia/Ho_Chi_Minh`. It returns only explicit month and collected columns, with no allocation aggregation. The controller DTO validates `months` with `@IsOptional()`, `@Type(() => Number)`, and `@IsIn([3, 6, 12])`, defaulting to `12`.

- [ ] **Step 1: Write failing repository/controller/DTO tests**

Assert:

```ts
it('queries payments by receivedAt and organization without payment-allocation sums', async () => {
  // expect DataSource.query to receive month boundaries and org-1
});

it('maps PostgreSQL amount strings to integer numbers', async () => {
  // expect collected: 123000
});

it('delegates the validated months value and requires REPORT_READ', async () => {
  // expect trend service call and reflected permission metadata
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec jest --runInBand src/modules/reporting/infrastructure/typeorm-trend-report.repository.spec.ts src/modules/reporting/presentation/reports.controller.spec.ts src/modules/reporting/presentation/dto/get-reports-trend-query.dto.spec.ts
```

Expected: FAIL because the trend repository, DTO, route, and provider wiring do not exist.

- [ ] **Step 3: Implement collected SQL, DTO, route, and module wiring**

Register `TREND_REPORT_REPOSITORY`, inject the #172 history query provider into the trend service, add `@Get('trend')`, and keep all business decisions in the application service/repositories rather than the controller.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same Jest command. Expected: repository mapping, DTO validation, controller delegation, and permission tests pass.

- [ ] **Step 5: Add Postgres integration coverage for the trend**

Insert payments in previous/current months and history rows supplied by #172. Assert:

- 3, 6, and 12 return exactly that many points;
- collected groups by `receivedAt` in the reporting timezone;
- months without payments return zero collected;
- history-backed outstanding values are returned unchanged;
- pre-history outstanding values remain null;
- tenant isolation and unauthenticated 401 behavior remain enforced.

Run:

```bash
pnpm exec jest --config ./test/jest-e2e.json --runInBand test/aging-dashboard-reporting.integration.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/reporting/infrastructure/typeorm-trend-report.repository.ts apps/backend/src/modules/reporting/infrastructure/typeorm-trend-report.repository.spec.ts apps/backend/src/modules/reporting/presentation apps/backend/src/modules/reporting/reporting.module.ts apps/backend/test/aging-dashboard-reporting.integration.spec.ts
git commit -m "feat: expose reports trend endpoint"
```

### Task 6: Add frontend report contracts, API functions, and query hooks

**Files:**
- Modify: `apps/frontend/src/features/reports/types.ts`
- Modify: `apps/frontend/src/features/reports/api/reports-api.ts`
- Modify: `apps/frontend/src/features/reports/api/use-reports.ts`
- Modify: `apps/frontend/src/features/reports/api/reports-api.spec.ts`

**Interfaces:**

```ts
export type TrendMonths = 3 | 6 | 12;

export interface CustomerAgingPage {
  items: Array<{
    customerId: string;
    customerName: string;
    taxCode: string;
    buckets: Array<{ bucket: AgingBucket; totalRemaining: number }>;
    totalRemaining: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

export interface ReportsTrend {
  months: TrendMonths;
  items: Array<{
    month: string;
    outstanding: number | null;
    collected: number;
  }>;
}
```

Add `fetchCustomerAging(filters)` with `page`, `limit`, optional `search`, optional `bucket`; add `fetchReportsTrend(months)` with `months`. Add `useCustomerAging(filters)` and `useReportsTrend(months)` with query keys that include every input.

- [ ] **Step 1: Write failing API tests**

Assert the exact requests:

```ts
it('fetches customer aging with page, search, and bucket parameters', async () => {
  // expect /api/v1/reports/aging/customers and params
});

it('fetches trend with the selected month preset', async () => {
  // expect /api/v1/reports/trend and params: { months: 6 }
});
```

- [ ] **Step 2: Run frontend focused tests and verify RED**

From `apps/frontend`:

```bash
pnpm exec vitest run src/features/reports/api/reports-api.spec.ts
```

Expected: FAIL because the functions/types/hooks do not exist.

- [ ] **Step 3: Implement types, API functions, and hooks**

Keep API response types local to `features/reports`, reuse `AgingBucket`, and omit an empty search parameter rather than sending a client-side sentinel.

- [ ] **Step 4: Run frontend focused tests and verify GREEN**

Run the same Vitest command. Expected: all API contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/reports/types.ts apps/frontend/src/features/reports/api/reports-api.ts apps/frontend/src/features/reports/api/use-reports.ts apps/frontend/src/features/reports/api/reports-api.spec.ts
git commit -m "feat: add reports customer aging and trend clients"
```

### Task 7: Build the customer-aging table, filters, URL state, and pagination

**Files:**
- Create: `apps/frontend/src/features/reports/components/customer-aging-filters.tsx`
- Create: `apps/frontend/src/features/reports/components/customer-aging-table.tsx`
- Modify: `apps/frontend/src/features/reports/pages/reports-page.tsx`
- Modify: `apps/frontend/src/features/reports/pages/reports-page.spec.tsx`

**Interfaces:**
- Consumes: `CustomerAgingPage`, `useCustomerAging`, `AgingBucket`, and existing shared `Input`, `Select`, `Table`, `Button`, `formatVND` components.
- Produces: URL parameters `agingSearch`, `agingBucket`, `agingPage`, and a Reports section with search/filter/table/pagination.

Use `useSearchParams` in `ReportsPage`. Parse `agingPage` as a positive integer, accept only canonical bucket values, default `agingSearch` to empty and `agingPage` to `1`, and reset `agingPage` to `1` whenever search or bucket changes. Pass `limit: 20` to the hook. Keep all five bucket columns visible and sort is server-owned.

- [ ] **Step 1: Write failing page/component tests**

Add tests for:

```tsx
it('renders customer identity, five bucket amounts, and total remaining', async () => {
  // mock customer aging data and assert formatted VND cells
});

it('sends URL search and bucket values and resets page on filter change', async () => {
  // render MemoryRouter with agingPage=3, type/select a filter, assert page=1 and hook params
});

it('renders empty and error states for customer aging', async () => {
  // assert distinct empty copy and existing report error treatment
});
```

- [ ] **Step 2: Run the focused frontend test and verify RED**

```bash
pnpm exec vitest run src/features/reports/pages/reports-page.spec.tsx
```

Expected: FAIL because the new query, filters, section, and table do not exist.

- [ ] **Step 3: Implement the filters, table, URL state, and pagination**

Use Vietnamese labels, accessible labels for search/select, shared shadcn table/select primitives, and `formatVND`. Do not add a new state-management library or a new pagination component.

- [ ] **Step 4: Run focused frontend tests and verify GREEN**

Run the same Vitest command. Expected: existing Reports tests plus the new customer-aging assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/reports/components/customer-aging-filters.tsx apps/frontend/src/features/reports/components/customer-aging-table.tsx apps/frontend/src/features/reports/pages/reports-page.tsx apps/frontend/src/features/reports/pages/reports-page.spec.tsx
git commit -m "feat: add customer aging table to reports"
```

### Task 8: Build the trend chart and preset selector

**Files:**
- Create: `apps/frontend/src/features/reports/components/reports-trend-chart.tsx`
- Modify: `apps/frontend/src/features/reports/pages/reports-page.tsx`
- Modify: `apps/frontend/src/features/reports/pages/reports-page.spec.tsx`

**Interfaces:**
- Consumes: `ReportsTrend`, `TrendMonths`, `useReportsTrend`, existing Recharts/report formatting patterns.
- Produces: URL parameter `trendMonths` and a chart with `outstanding` and `collected` series.

The selector accepts only 3, 6, and 12, defaults to 12, and updates `trendMonths` in the URL. Use one shared VND axis and a tooltip that formats non-null values. Preserve `null` outstanding points so Recharts leaves a gap; render a short Vietnamese note when any point is unavailable. Mark the current month as partial/as-of-now in the label or explanatory copy.

- [ ] **Step 1: Write failing chart/page tests**

Add tests for:

```tsx
it('renders both trend series and a 3/6/12 preset selector', async () => {
  // mock trend response and assert labels/selector options
});

it('keeps null outstanding points as unavailable rather than zero', async () => {
  // assert the explanatory note and no formatted zero for the null point
});

it('persists the selected trend preset in the URL', async () => {
  // select 3 and assert trendMonths=3
});
```

- [ ] **Step 2: Run the focused frontend test and verify RED**

```bash
pnpm exec vitest run src/features/reports/pages/reports-page.spec.tsx
```

Expected: FAIL because the trend hook, selector, and chart do not exist.

- [ ] **Step 3: Implement the chart and preset selector**

Reuse the installed `recharts` dependency and existing card/select primitives. Keep chart rendering presentational; the page owns query state and URL synchronization.

- [ ] **Step 4: Run focused frontend tests and verify GREEN**

Run the same Vitest command. Expected: all Reports page tests pass, including existing CSV export behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/reports/components/reports-trend-chart.tsx apps/frontend/src/features/reports/pages/reports-page.tsx apps/frontend/src/features/reports/pages/reports-page.spec.tsx
git commit -m "feat: add reports trend chart"
```

### Task 9: Run full verification and prepare the handoff

**Files:**
- Modify only if verification finds a defect: files from Tasks 1–8.

**Interfaces:**
- Consumes: all report API, application, infrastructure, e2e, and frontend behavior from Tasks 1–8.
- Produces: a clean, reviewable branch with evidence for each completion claim.

- [ ] **Step 1: Run the focused backend reporting unit suite**

From `apps/backend`:

```bash
pnpm exec jest --runInBand src/modules/reporting
```

Expected: all reporting unit suites pass.

- [ ] **Step 2: Run the reporting Postgres integration suite**

```bash
pnpm exec jest --config ./test/jest-e2e.json --runInBand test/aging-dashboard-reporting.integration.spec.ts
```

Expected: all existing and new reporting integration tests pass against Postgres.

- [ ] **Step 3: Run the frontend Reports suite**

From `apps/frontend`:

```bash
pnpm exec vitest run src/features/reports
```

Expected: all Reports frontend tests pass.

- [ ] **Step 4: Run backend domain and architecture checks**

From `apps/backend`:

```text
/domain-check
pnpm run arch-check
```

Expected: no domain-rule or Clean Architecture violations.

- [ ] **Step 5: Run the repository verification gate**

From the repository root:

```bash
pnpm verify
```

Expected: lint, type-check, unit tests, and architecture checks complete successfully. If an unrelated existing failure remains, record the exact command/output and do not claim a clean gate.

- [ ] **Step 6: Inspect the final diff and worktree state**

```bash
git diff main...HEAD --stat
git status --short --branch
```

Confirm no `.env` files are tracked, no changes exist on the main worktree, and the diff contains only the agreed #135 implementation plus required test/docs changes.

- [ ] **Step 7: Commit any final verification fixes**

```bash
git add <only the files changed by verification fixes>
git commit -m "test: verify reports customer aging and trend"
```

Do not stage `.env` files or unrelated worktree changes.

Do not push or open a PR until the user reviews the branch and explicitly asks for publication.
