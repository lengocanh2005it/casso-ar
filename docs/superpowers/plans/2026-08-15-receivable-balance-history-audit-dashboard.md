# Receivable Balance History Audit Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the tenant-scoped, permission-protected receivable balance-history audit feature from GitHub issue #176: provenance-aware snapshots, paginated API, KPI/chart summary, synchronous CSV export, and the organization dashboard.

**Architecture:** Keep the existing append-only snapshot recorder as the single write path. Add audit metadata to the history domain/ORM row, pass actor provenance explicitly from each transition caller, and expose read/summary/export use cases through the existing `receivable-balance-history` module. SQL query code performs tenant-scoped joins to receivables, invoices, customers, and users without changing the snapshot schema to duplicate display data. The frontend consumes the three authenticated endpoints from a new feature folder and reuses existing cards, Recharts, pagination, CSV, RBAC, and sidebar patterns. Backend, API, and frontend are one coupled vertical slice because they share one response contract; no separate subsystem plans are needed.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, Jest, shared TypeScript RBAC types, React, React Query, Recharts, existing CSV writer and throttler.

**Spec:** GitHub issue #176 (updated with the grilling decisions), `CONTEXT.md`, ADR-0017, and ADR-0018.

## Global Constraints

- `organizationId` comes only from tenant context or an explicit migration row; every list, summary, export, join, and write is tenant-scoped.
- Money remains integer VND and `bigint`; `remainingAmount` is read from immutable snapshots, never reconstructed with `SUM(payment_allocations)`.
- New runtime rows require `actorType` and a source-derived `reasonCode`; `USER` requires `actorUserId`, while `WEBHOOK` and `SYSTEM` require a null user id. Legacy rows keep unknown actor/reason metadata null.
- Keep `changeReason` nullable in the database during this feature. Copy only valid, organization-matching legacy allocation UUIDs into `transitionReferenceId`; do not expose or use the old column for new writes. Dropping it is a separate cleanup migration.
- API endpoints are authenticated first-party organization APIs, not unauthenticated internet endpoints: `GET /api/v1/receivable-balance-history`, `/summary`, and `/export` all require `RECEIVABLE_AUDIT_READ`.
- `RECEIVABLE_AUDIT_READ` is granted only to `OWNER` and `FINANCE_MANAGER`; export is limited to 10 requests/minute per `(organizationId, userId)`.
- Date boundaries and daily buckets use `Asia/Ho_Chi_Minh`; persisted timestamps remain `timestamptz`; API timestamps are ISO strings. Summary defaults to the latest 30 calendar days.
- Response DTOs are classes in `.dto.ts` files and never expose `organizationId`, `version`, email, payment internals, or other internal fields. CSV uses the existing formula-injection-safe writer.
- Follow RED → GREEN → REFACTOR for behavior changes. Migration-only work is the explicitly allowed TDD exception, but it must have migration/integration verification.

---

## Task 1: Lock the shared permission and domain metadata contract

**Files:**
- Modify `packages/shared-types/src/permission.ts`
- Modify `packages/shared-types/src/role-permissions.ts`
- Add `apps/backend/src/modules/receivable-balance-history/domain/balance-history-actor-type.ts`
- Add `apps/backend/src/modules/receivable-balance-history/domain/balance-history-reason-code.ts`
- Add `apps/backend/src/modules/receivable-balance-history/domain/transition-provenance.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/domain/receivable-balance-history-entry.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-recorder.service.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-recorder.service.spec.ts`
- Modify `apps/frontend/src/lib/rbac.spec.ts`

**Interfaces and behavior:**
- Add `Permission.RECEIVABLE_AUDIT_READ`; add it explicitly to `OWNER` through `Object.values` and to `FINANCE_MANAGER`, but not to `ACCOUNTANT`, `SALES_REP`, or `VIEWER`.
- Define `BalanceHistoryActorType = USER | SYSTEM | WEBHOOK` and the six stable reason codes from `CONTEXT.md`.
- Define `TransitionProvenance { actorType; actorUserId }` and an object-shaped recorder input carrying `receivable`, `changeSource`, `provenance`, optional `note`, optional `transitionReferenceId`, and `manager`.
- Derive `reasonCode` from `changeSource` inside the recorder; do not accept caller-provided free-text classification. Validate the actor invariants and fail before insert when provenance is missing or inconsistent.
- Remove `changeReason` from the domain entry; add nullable audit metadata fields and keep the explicit domain-to-ORM mapper responsible for any legacy column compatibility.

**RED:** Add tests that expect source-to-reason mapping, `USER` without an id to reject, `WEBHOOK/SYSTEM` with an id to reject, and the reference/note to be persisted in the entry passed to `append`; run `cd apps/backend; npx jest --testPathPattern receivable-balance-history-recorder.service.spec.ts` and observe failure.

**GREEN:** Implement the enums, provenance type, entry fields, recorder validation/mapping, and shared permission; update the frontend RBAC test to prove only OWNER/FINANCE_MANAGER pass; rerun the focused tests.

**REFACTOR:** Replace positional recorder arguments at the type boundary with the object input, keep the source map in one small constant, run `git diff --check`, and commit `feat: add receivable balance audit contract`.

## Task 2: Add the append-only schema migration and legacy backfill

**Files:**
- Add `apps/backend/src/database/migrations/20260823000000-add-receivable-balance-history-audit-metadata.ts`
- Add `apps/backend/src/database/migrations/20260823000000-add-receivable-balance-history-audit-metadata.spec.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/infrastructure/receivable-balance-history.orm-entity.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history.repository.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history.repository.spec.ts`

**Interfaces and behavior:**
- Add nullable `actorType`, `actorUserId`, `reasonCode`, `note`, and `transitionReferenceId` columns; keep `actorUserId` and `transitionReferenceId` as UUID columns without foreign keys because actor/allocation rows can be removed independently of immutable history.
- Add checks for allowed actor values and actor/id combinations while allowing all-null legacy metadata. Preserve the existing tenant/effective-time and tenant/receivable/effective-time indexes.
- In one migration transaction, copy `changeReason` into `transitionReferenceId` only when the source is `ALLOCATE` or `UNDO`, the value is a valid UUID, and a matching allocation exists in the same organization. Leave all other legacy audit metadata null. Keep the old nullable column untouched.
- Update `toOrm()` and repository assertions so appends stay insert-only and tenant mismatch still fails.

**Verification:** Because migrations are an allowed TDD exception, run the migration against the test Postgres, assert upgrade and revert behavior, assert valid/invalid legacy-reference handling, then run `cd apps/backend; npx jest --testPathPattern receivable-balance-history`.

## Task 3: Thread explicit provenance through every snapshot write path

**Files:**
- Modify `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`
- Modify `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts`
- Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`
- Modify `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.ts`
- Modify `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.ts`
- Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts`
- Modify `apps/backend/src/modules/payments/presentation/payments.controller.ts`
- Modify `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts`
- Modify `apps/backend/src/modules/receivables/application/create-receivable.usecase.spec.ts`
- Modify `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`
- Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`
- Modify `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.spec.ts`
- Modify `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.spec.ts`
- Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`
- Modify `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`
- Modify `apps/backend/src/modules/webhooks/application/process-webhook.usecase.spec.ts`

**Interfaces and behavior:**
- Human HTTP create/cancel/write-off/allocate/undo paths pass `{ actorType: USER, actorUserId: currentUser.userId }` explicitly into the recorder call. Missing authenticated user is an application error, not a `"system"` sentinel.
- Webhook auto-allocation passes `{ actorType: WEBHOOK, actorUserId: null }` directly to `allocateWithinTransaction`; the existing `tenantContext.run({ userId: 'system' })` must never be used to infer actor type.
- Any internal/system transition caller passes `{ actorType: SYSTEM, actorUserId: null }` explicitly. Keep allocation id in `transitionReferenceId`; pass `undoReason` as `note` only for undo.
- Preserve transaction scope: the snapshot and its receivable/payment/allocation status changes remain in the same transaction, and no external event call moves inside it.

**RED:** Change the recorder signature in the test doubles and add assertions for CREATE, CANCEL, WRITE_OFF, ALLOCATE, UNDO, and webhook auto-allocation actor/reason/reference/note values; run the focused receivable, payment, and webhook specs and observe compile/test failures.

**GREEN:** Update all call sites found by `rg "historyRecorder\\.record|allocateWithinTransaction"`, including batch callers and test fixtures, until the focused suite passes.

**REFACTOR:** Remove obsolete `changeReason` argument names/imports, verify there is no actor inference from `allocatedByUserId` or `"system"`, and commit `feat: record receivable history provenance`.

## Task 4: Define the tenant-scoped read contract and query implementation

**Files:**
- Modify `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-query.port.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.ts`
- Add `apps/backend/src/modules/receivable-balance-history/application/list-receivable-balance-history.usecase.ts`
- Add `apps/backend/src/modules/receivable-balance-history/application/get-receivable-balance-history-summary.usecase.ts`
- Add `apps/backend/src/modules/receivable-balance-history/application/list-receivable-balance-history.usecase.spec.ts`
- Add `apps/backend/src/modules/receivable-balance-history/application/get-receivable-balance-history-summary.usecase.spec.ts`

**Interfaces and behavior:**
- Extend the existing query port with typed filters (`receivableId`, inclusive local `from`/`to`, status, change source, actor type), page/limit, list rows, summary KPIs, daily transition series, and source distribution. Reuse the existing monthly-outstanding method for reports.
- List order is always `effectiveAt DESC, sequence DESC`; page defaults to 1/20 and caps at 100. Convert local date filters to HCMC UTC boundaries before SQL.
- List SQL selects only audit-safe fields and uses tenant-scoped joins to `receivables`, `invoices`, `customers`, and `users` for `invoiceNumber`, `customerName`, and nullable `actorDisplayName`; never select actor email or payment columns.
- Summary SQL returns `totalTransitions`, distinct `affectedReceivables`, and one latest snapshot per receivable within the selected range ordered by `effectiveAt DESC, sequence DESC`, then sums that snapshot’s integer `remainingAmount` once. A separate day series fills zero-count days; source counts group by `changeSource`.
- Keep all SQL tenant predicates explicit, use parameterized query values, and preserve the existing tenant-context mismatch guard.

**RED:** Add use-case tests for default/explicit filters, page boundaries, HCMC date conversion, and the latest-per-receivable remaining sum; run the two focused specs and observe failure.

**GREEN:** Implement the port, query adapter, and use cases with the existing `DataSource.query`/date-fns-tz patterns; make the focused tests pass.

**REFACTOR:** Keep list and summary SQL in the existing query adapter rather than adding a second reader abstraction, remove `SELECT *`, and commit `feat: add receivable audit queries`.

## Task 5: Expose paginated API, summary, CSV export, and export audit logging

**Files:**
- Add `apps/backend/src/modules/receivable-balance-history/presentation/dto/receivable-balance-history-query.dto.ts`
- Add `apps/backend/src/modules/receivable-balance-history/presentation/dto/receivable-balance-history-response.dto.ts`
- Add `apps/backend/src/modules/receivable-balance-history/presentation/receivable-balance-history-export-rate-limit.guard.ts`
- Add `apps/backend/src/modules/receivable-balance-history/presentation/receivable-balance-history.controller.ts`
- Add `apps/backend/src/modules/receivable-balance-history/application/export-receivable-balance-history.usecase.ts`
- Modify `apps/backend/src/modules/receivable-balance-history/receivable-balance-history.module.ts`
- Modify `apps/backend/src/common/audit/audit.enums.ts`
- Add `apps/backend/src/modules/receivable-balance-history/application/export-receivable-balance-history.usecase.spec.ts`
- Add `apps/backend/src/modules/receivable-balance-history/presentation/receivable-balance-history.controller.spec.ts`

**Interfaces and behavior:**
- Add `GET /api/v1/receivable-balance-history`, `/summary`, and `/export`. Put `@ApiTags`, `@ApiOperation`, response DTO decorators, and `@ApiErrorResponse(VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMIT_EXCEEDED)` on each applicable endpoint. Use `@ApiOkResponse({ content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } })` for CSV.
- Apply `JwtAuthGuard`, `PermissionGuard`, and `@RequirePermission(Permission.RECEIVABLE_AUDIT_READ)` at controller/route level. No unauthenticated or cross-organization variant exists.
- Query DTO uses `.dto.ts`, class-validator, explicit Swagger numeric metadata for `page`/`limit`, enum validation, UUID validation, and ISO local date validation. Summary defaults to 30 HCMC calendar days when both dates are omitted; list/export retain their supplied filters.
- Export reuses `toCsv`, caps query rows at 10,000, sets `X-Export-Truncated: true` when more rows match, and returns only audit-safe columns. Add `RECEIVABLE_BALANCE_HISTORY_EXPORT` to `AuditActionType`; after a successful export, write one existing `AuditLog` containing actor/time/filter scope/truncated status, without logging list or summary reads.
- Add a scoped `ThrottlerGuard` using `getScopedRateLimitTracker(req, 'receivable-balance-history-export', ['organizationId', 'userId'])` and `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on export.

**RED:** Add controller/use-case tests for permission metadata, validation, pagination response, CSV headers/truncation, one export audit log, and rate-limit guard tracking; run the focused specs and observe failure.

**GREEN:** Wire the DTOs, controller, export use case, guard, audit action, and module providers/exports; make focused tests pass.

**REFACTOR:** Keep controller orchestration-only, use the existing CSV writer and audit repository, and commit `feat: expose receivable balance audit api`.

## Task 6: Verify backend integration and security boundaries

**Files:**
- Add `apps/backend/test/receivable-balance-history-audit.e2e-spec.ts`
- Modify `apps/backend/test/receivable-balance-history.integration.spec.ts` only where existing fixtures/assertions need the new columns
- Modify `apps/backend/test/swagger-docs.e2e-spec.ts` to assert the three documented routes and CSV content type

**Tests to implement:**
- OWNER and FINANCE_MANAGER can list, summarize, and export only their own organization’s rows.
- ACCOUNTANT, SALES_REP, and VIEWER receive 403 and the frontend link is not needed for them; unauthenticated requests receive 401.
- Tenant A cannot see Tenant B by `receivableId` or filters; invalid UUID/date/status/source/actor query values receive the standard validation shape.
- List ordering is `effectiveAt DESC, sequence DESC`; old rows return null actor/reason metadata; webhook allocation and manual undo show distinct actor types with the same allocation reference and immutable prior rows.
- Summary KPI and chart values match fixtures with multiple snapshots for one receivable, including latest-snapshot-only remaining sum and HCMC day buckets.
- Export matches filters, formula-safe escaping, 10,000-row truncation header, export audit log, and 11th request rate limiting.
- OpenAPI documents all three endpoints, query parameters, response DTOs, CSV content type, and error codes.

**Verification:** Run `cd apps/backend; npx jest --testPathPattern receivable-balance-history-audit.e2e-spec.ts`, then the existing history integration suite and `pnpm verify` from the repository root after the frontend tasks are complete.

## Task 7: Add the frontend API client and permission-gated navigation/route

**Files:**
- Add `apps/frontend/src/features/receivable-balance-history/types.ts`
- Add `apps/frontend/src/features/receivable-balance-history/api/receivable-balance-history-api.ts`
- Add `apps/frontend/src/features/receivable-balance-history/api/use-receivable-balance-history.ts`
- Add `apps/frontend/src/features/receivable-balance-history/api/receivable-balance-history-api.spec.ts`
- Add `apps/frontend/src/components/layout/sidebar.spec.tsx`
- Add `apps/frontend/src/routes/protected-route.spec.tsx`
- Modify `apps/frontend/src/components/layout/nav-items.ts`
- Modify `apps/frontend/src/components/layout/sidebar.tsx`
- Modify `apps/frontend/src/routes/protected-route.tsx`
- Modify `apps/frontend/src/routes/index.tsx`

**Interfaces and behavior:**
- Type the list, item, summary KPI, daily series, source distribution, and actor display fields without `any`; use integer numbers for money and ISO strings for timestamps.
- Add fetch hooks keyed by all filters/page, a summary hook keyed by date/filter range, and an export call using `apiRequestWithHeaders` so `X-Export-Truncated` can surface the warning. Reuse `useCsvExport` for download state.
- Add “Lịch sử công nợ” beside “Báo cáo” with `permission: Permission.RECEIVABLE_AUDIT_READ`; filter it from the sidebar via existing `hasPermission`. Add a small `PermissionRoute`/forbidden view using the existing auth context so a direct unauthorized UI route shows 403 semantics while the backend remains authoritative.
- Keep this in the organization app route tree, not `/admin`.

**RED:** Add API serialization tests, hook query-key tests, sidebar visibility tests for OWNER/FINANCE_MANAGER versus other roles, and permission-route tests; run `cd apps/frontend; pnpm test -- src/features/receivable-balance-history/api/receivable-balance-history-api.spec.ts src/components/layout/sidebar.spec.tsx src/routes/protected-route.spec.tsx` and observe failure.

**GREEN:** Implement the types/API/hooks, nav permission filtering, route, and lazy import; make focused frontend tests pass.

**REFACTOR:** Reuse the reports API/query conventions and avoid a new client or chart dependency; commit `feat: wire receivable audit frontend access`.

## Task 8: Build the audit dashboard with KPI, charts, filters, table, detail, pagination, and CSV

**Files:**
- Add `apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.tsx`
- Add `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-kpis.tsx`
- Add `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-charts.tsx`
- Add `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-filters.tsx`
- Add `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-table.tsx`
- Add `apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.spec.tsx`

**Interfaces and behavior:**
- Default the date range to the latest 30 HCMC calendar days and synchronize filters/page in URL search params. Changing any filter resets page to 1.
- Show KPI cards for total transitions, affected receivables, and total latest remaining amount. Show a daily transitions line/bar chart and change-source distribution chart using installed Recharts; render empty/loading/error states accessibly.
- Show a paginated newest-first table with effective time, invoice number, customer, status, remaining amount, change source/reason, actor type/display name, reference id, and note. A row detail affordance exposes only the same audit-safe fields; no email/payment internals.
- Provide status/source/actor/date/receivable filters, page controls, and CSV export with a visible truncation warning when the response header says true. Keep keyboard focus, labels, table headers, and chart fallback text usable.

**RED:** Add page tests for loading/error/empty states, KPI/chart rendering from fixture data, filter-to-query mapping, pagination reset, row detail fields, permission denial, and truncated export warning; run `cd apps/frontend; pnpm test -- src/features/receivable-balance-history/pages/receivable-balance-history-page.spec.tsx` and observe failure.

**GREEN:** Implement the page/components with existing shadcn cards, select/input/button, table, and Recharts patterns; make the page spec pass.

**REFACTOR:** Delete duplicate formatting/query-param code, keep chart data transformations local to the page/components, and commit `feat: add receivable audit dashboard`.

## Task 9: Final verification and handoff

**Files:**
- Modify `docs/wayfinder/feature-map.md` status for issue #176 to `in-progress` at start of implementation and `done` only after merge/PR; add the shipped date/PR reference then.
- Preserve the already-updated `CONTEXT.md` domain decisions in the worktree.

**Checks:**
- From `apps/backend`, run the focused recorder/query/controller/e2e tests, the full backend unit suite, the relevant integration/e2e suites, `npx tsc --noEmit`, and the domain-check skill.
- From `apps/frontend`, run focused feature tests, the full frontend test suite, and type-check.
- From the repository root, run `pnpm verify`, inspect `git diff --check`, and run the verification-before-completion skill. Fix every architectural, Swagger, tenant, security, or type failure before claiming completion.
- Confirm `rg "changeReason"` shows only the compatibility migration/ORM field and no new runtime classification; confirm no production `any`, `console.log`, unscoped query, or raw unauthenticated history route was introduced.
- Commit only intentional files with the required message format, push the feature branch, open the PR closing #176, and wait for user review before merging or cleaning the Orca worktree.
