# Report Aggregate Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent report monetary totals and history snapshots from losing VND integer precision by returning exact base-10 integer strings throughout the API and displaying them exactly in the frontend.

**Architecture:** Keep PostgreSQL `int8` parsing and request-time money storage unchanged. Convert report aggregate and snapshot query results to decimal strings at their SQL/repository boundaries, describe those fields as strings in DTO/OpenAPI contracts, and update first-party frontend consumers to format exact strings. Charts may derive bounded numeric geometry while retaining the original exact amount for labels and tooltips.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest/Testcontainers, TypeScript, React, Recharts, Intl.NumberFormat.

## Global Constraints

- Report monetary fields in issue #429 are base-10 integer strings for all values, including values within `Number.MAX_SAFE_INTEGER`.
- PostgreSQL aggregates and selected `bigint` history snapshots are converted to text locally in their report SQL; do not change the global PostgreSQL `int8` parser.
- Keep counts, dates, ratios, and chart geometry numeric where their existing contracts require numbers; only monetary report values become strings.
- Backend must not use `any`; preserve tenant scoping and query-time derived values.
- Frontend user-facing money, accessible table content, and tooltips must preserve the exact amount. Chart geometry may use a scaled approximation.
- Preserve existing endpoint paths and field names. Update the backend OpenAPI schema and frontend types/consumers together.
- Follow RED → GREEN → REFACTOR for each behavior slice. Do not add dependencies.
- Do not commit secrets or `.env` files. Use commit type `fix`.

---

### Task 1: Aging report exact totals

**Files:**
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-aging-report.repository.ts`
- Modify: `apps/backend/src/modules/reporting/application/aging-report.repository.port.ts`
- Modify: `apps/backend/src/modules/reporting/application/aging-report-query.service.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.spec.ts`
- Create or modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-aging-report.repository.spec.ts`
- Modify: `apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts` (if present)

**Interfaces:** `totalRemaining` and each aging bucket total are `string`; zero-filled buckets use `'0'`. Counts remain numbers.

- [x] Write repository and query-service tests asserting totals remain strings for ordinary values and values above `Number.MAX_SAFE_INTEGER`.
- [x] Run the focused Jest spec(s) and observe failure because the repository/service currently coerce or synthesize numeric amounts.
- [x] Cast aggregate outputs to text in SQL, map them to strings, return string zero buckets, and update the manual `/reports/aging` OpenAPI schema to `type: string`, a digits-only pattern, and a decimal-string example. Do not declare `format: int64`, because a PostgreSQL `SUM` can exceed signed 64-bit range.
- [x] Re-run focused specs and type-check the reports backend package.
- [x] Review the diff for number coercions on money fields and commit as `fix: preserve aging report amount precision`.

### Task 2: Customer aging exact totals

**Files:**
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.ts`
- Modify: `apps/backend/src/modules/reporting/application/customer-aging-report.repository.port.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/dto/customer-aging-response.dto.ts`
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-customer-aging-report.repository.spec.ts`

**Interfaces:** Customer bucket totals and row `totalRemaining` become decimal strings; customer counts and identity fields retain their existing types.

- [x] Update repository tests to assert exact string values for every bucket and row total, including `9007199254740993`.
- [x] Run the focused repository spec and observe failure against existing `Number(...)` mapping.
- [x] Cast PostgreSQL aggregates to text, keep mapper values as strings, and update Swagger DTO properties to string integer fields with decimal-string examples.
- [x] Re-run the focused spec and backend type-check.
- [x] Review for accidental changes to counts/tenant filters and commit as `fix: preserve customer aging amount precision`.

### Task 3: Dashboard summary exact totals

**Files:**
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-dashboard-summary.repository.ts`
- Modify: `apps/backend/src/modules/reporting/application/dashboard-summary.repository.port.ts`
- Modify: `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts`
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-dashboard-summary.repository.spec.ts` (create if absent)
- Modify: `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/reports.controller.ts`

**Interfaces:** Outstanding, overdue, forecast, and top-customer monetary amounts become strings. Counts and the calculated non-money `overdueRate` remain numbers.

- [x] Add repository tests for exact outstanding/overdue/forecast/top-customer sums above the safe-integer boundary and service tests for string totals plus a numeric overdue rate.
- [x] Run focused tests and observe failure against the current numeric mapper/service behavior.
- [x] Cast report sums to text, map money as strings, compute the overdue-rate zero check/division using exact integer inputs and a bounded numeric ratio, and update the complete nested `/reports/dashboard-summary` OpenAPI schema so all money fields are strings.
- [x] Re-run focused tests and backend type-check.
- [x] Review the changed schema against the returned object shape and commit as `fix: preserve dashboard report amount precision`.

### Task 4: Collected trend exact totals

**Files:**
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-trend-report.repository.ts`
- Modify: `apps/backend/src/modules/reporting/application/trend-report.repository.port.ts`
- Modify: `apps/backend/src/modules/reporting/application/trend-report-query.service.ts`
- Modify: `apps/backend/src/modules/reporting/presentation/dto/reports-trend-response.dto.ts`
- Modify: `apps/backend/src/modules/reporting/infrastructure/typeorm-trend-report.repository.spec.ts`
- Modify: `apps/backend/src/modules/reporting/application/trend-report-query.service.spec.ts` (if present)
- Modify: `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-query.port.ts` (monthly outstanding only)
- Modify: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.ts` (monthly aggregate only)
- Modify: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.spec.ts` (monthly aggregate cases)

**Interfaces:** Trend `collected` and `outstanding` monetary fields become decimal strings; missing collected periods use `'0'`, uncovered outstanding periods remain `null`. Dates and point counts keep current types.

- [x] Update repository/service and monthly-history tests for exact sums above the safe-integer boundary and `'0'` for missing collected periods.
- [x] Run focused specs and observe failure while the repository/service still return numbers.
- [x] Cast aggregate output to text, preserve the string through the query service, and keep date bucketing/counts unchanged.
- [x] Re-run focused specs and backend type-check.
- [x] Review trend grouping boundaries and commit as `fix: preserve collected trend amount precision`.

### Task 5: Receivable balance history exact values

**Files:**
- Modify: `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-query.port.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/presentation/dto/receivable-balance-history-response.dto.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.spec.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/application/list-receivable-balance-history.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/application/get-receivable-balance-history-summary.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/application/export-receivable-balance-history.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/presentation/receivable-balance-history.controller.spec.ts`
- Modify: `apps/backend/test/receivable-balance-history.integration.spec.ts`

**Interfaces:** Each history row's `remainingAmount` and summary `latestRemainingAmount` become decimal strings; monthly outstanding and trend amounts are already exact strings from Task 4. Counts and dates stay unchanged.

- [x] Update unit tests to assert exact direct history snapshots and summary aggregates, including an individual snapshot above `Number.MAX_SAFE_INTEGER`.
- [x] Run focused unit tests and observe failure against number interfaces/mapping.
- [x] Cast SQL `SUM` results to text and select the persisted `remainingAmount` as `::text`; preserve strings through the port, query implementation, and response DTO/OpenAPI schema. Keep the global int8 parser unchanged.
- [x] Extend the Testcontainers integration test to persist and retrieve a large snapshot plus aggregate several individually safe values above the safe-integer boundary.
- [x] Run the focused unit and integration specs, then backend type-check.
- [x] Review query organization scoping and append-only history semantics; commit as `fix: preserve balance history amount precision`.

### Task 6: Frontend report contract, exact rendering, and charts

**Files:**
- Modify: `apps/frontend/src/lib/format.ts` and `apps/frontend/src/lib/format.spec.ts`
- Modify: `apps/frontend/src/lib/chart.ts` and `apps/frontend/src/lib/chart.spec.ts`
- Modify: `apps/frontend/src/features/reports/types.ts`
- Modify: `apps/frontend/src/features/receivable-balance-history/types.ts`
- Modify: `apps/frontend/src/components/metric-card.tsx` and `apps/frontend/src/components/metric-card.spec.tsx`
- Modify: `apps/frontend/src/features/reports/components/aging-table.tsx` and its spec
- Modify: `apps/frontend/src/features/reports/components/aging-chart.tsx` and its spec
- Modify: `apps/frontend/src/features/reports/components/customer-aging-table.tsx` and its spec
- Modify: `apps/frontend/src/features/reports/components/dashboard-summary.tsx` and a component spec
- Modify: `apps/frontend/src/features/reports/pages/reports-page.tsx` and its spec
- Modify: `apps/frontend/src/features/reports/components/reports-trend-chart.tsx` and its spec
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-table.tsx` and its spec
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-kpis.tsx` and its spec
- Modify affected fixtures in `apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.spec.tsx`.
- Modify: `apps/frontend/src/features/dashboard/pages/dashboard-page.tsx` and its spec, because it consumes the affected report summary/trend hooks.
- Modify: `apps/frontend/src/features/dashboard/components/receivable-trend-chart.tsx`, `payment-activity-chart.tsx`, `overdue-donut-chart.tsx`, and `dashboard-charts.spec.tsx` because the trend response type and chart data now use exact strings.

**Interfaces:** All affected report/history money properties become strings. `formatVND` handles exact decimal strings through `BigInt`; counts/ratios stay numbers. UI totals use exact integer arithmetic. Chart geometry uses bounded percentage ratios against the maximum, while tooltips and accessible tables retain and format original strings. Metric cards show exact values and do not compact report money.

- [x] Add utility and rendered-component regression tests for zero, ordinary VND, `9007199254740993`, larger integer strings, string zero chart data, aging totals formed from individually safe buckets into an unsafe sum, and exact dashboard/history/trend values.
- [x] Run the focused frontend specs and observe expected failures from number-only report types, lossy formatting, and numeric aging sums.
- [x] Change report/history contracts and fixtures to strings; implement `BigInt`-backed `formatVND`, string-aware chart-value detection, exact bucket summation, zero checks, exact metric/table rendering, and percentage-only numeric chart datasets with original exact values carried for tooltip/accessibility rendering.
- [x] Run focused frontend specs and frontend type-check; ensure chart tooltips and accessible tables format source strings without `Number` coercion.
- [x] Review all affected report/history consumers and commit `fix: render report aggregates exactly`.

### Task 7: Cross-endpoint aggregate regression coverage

**Files:**
- Modify: `apps/backend/test/aging-dashboard-reporting.integration.spec.ts`
- Modify relevant FE integration/component tests only if the endpoint fixtures require contract updates.

- [x] Add one integration fixture with multiple individually safe receivable/payment amounts whose report sum exceeds `Number.MAX_SAFE_INTEGER`; assert exact JSON decimal strings across aging, customer aging, dashboard outstanding/forecast, and collected trend responses. Keep all seeded rows tenant-scoped.
- [x] Run the focused reporting Testcontainers integration spec; also rerun the history integration spec to cover Task 5's large snapshot and safe-row monthly sum cases.
- [x] Verify all report API money fields are strings at and above the boundary, and that Task 5's history integration preserves both an individually large snapshot and a monthly sum formed from individually safe snapshots.
- [x] Run relevant frontend tests to ensure response fixtures match the string contract.
- [x] Review the complete issue coverage matrix and commit `test: verify exact reporting aggregates over HTTP`.

### Task 8: Whole-change verification and review

**Files:**
- Review all implementation changes and the already accepted ADR/spec updates.

- [ ] Run focused backend and frontend tests for changed slices.
- [ ] Run full relevant backend and frontend unit suites and `pnpm verify`.
- [ ] Run backend domain-check and applicable reporting/history integration specs.
- [ ] Run `git diff --check`, inspect generated OpenAPI output if available, and verify no affected report money field still uses a numeric DTO/type or `Number(...)` coercion.
- [ ] Complete Standards and Spec code reviews; resolve findings, then commit any review fixes.
- [ ] Confirm working tree contains no unrelated changes and all changes are committed on `fix/report-aggregate-precision`.
