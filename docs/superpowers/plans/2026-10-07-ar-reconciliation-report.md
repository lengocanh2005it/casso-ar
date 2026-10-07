# AR Reconciliation Report Implementation Plan

> **For agentic workers:** Execute inline with the approved `superpowers:executing-plans` workflow. Steps use checkbox syntax for tracking.

**Goal:** Add a tenant-scoped, read-only report that compares receivable/payment rollups, active allocations, and AR ledger balances.

**Architecture:** `GET /api/v1/ledger/reconciliation` uses the existing `RECEIVABLE_AUDIT_READ` permission and tenant context. A use case turns a bounded page of database snapshots into findings; one PostgreSQL statement reads the page and its allocation/ledger aggregates from one statement snapshot. Cursor pages are live independently.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest, class-validator, Swagger.

## Global Constraints

- Keep amounts as integer VND and TypeORM `bigint`; `delta = storedValue - expectedValue`.
- Every query must scope subjects, active allocations, and ledger events by the tenant `organizationId`.
- The report is read-only and checks all receivables/payments regardless of status.
- It sums active allocations only to diagnose persisted-rollup drift; it never uses that sum to calculate request-time balances or persist rollups.
- Cancelled and written-off receivables have zero ledger-active balance; their derived `remainingAmount` is not the recognized AR balance.
- Process at most 100 subjects per cursor page; expose `nextCursor` and `complete`.
- Use a single SQL statement per page so each page sees one consistent database snapshot.
- A baseline is incomplete only when current balance is nonzero and neither a rollout baseline nor an opening event exists; zero balances were intentionally skipped by the rollout migration.
- The authenticated request context identifies the tenant; finding responses omit `organizationId` per the response-DTO redaction convention.
- Follow Clean Architecture and existing controller permission/Swagger conventions; add no dependency or migration.

---

### Task 1: Define reconciliation findings and tenant use case

**Files:**
- Create: `apps/backend/src/modules/ledger/domain/ar-reconciliation.ts`
- Create: `apps/backend/src/modules/ledger/application/ar-reconciliation-query.port.ts`
- Create: `apps/backend/src/modules/ledger/application/reconcile-ar-balances.usecase.ts`
- Create: `apps/backend/src/modules/ledger/application/reconcile-ar-balances.usecase.spec.ts`

**Interface:**
- `IArReconciliationQuery.listPage(organizationId, cursor, limit)` returns no more than `limit` subject snapshots and a continuation cursor.
- `ReconcileArBalancesUseCase.execute({ cursor?, limit? })` gets `organizationId` from `TenantContextService`, defaults to 20, caps at 100, and returns `{ findings, nextCursor, complete }`.
- Each numeric finding carries subject type/ID, comparison code, stored value, expected value, and signed integer delta. An incomplete-history finding has null expected/delta.

- [x] **Step 1: Write a failing use-case test** for matching receivable/payment snapshots producing no findings and for tenant ID being taken from context.
- [x] **Step 2: Run it and confirm the missing module/interface failure.**
- [x] **Step 3: Add the domain finding types and comparison function plus the tenant-scoped use case.** Emit separate findings for allocation/rollup and ledger/current-balance mismatches. Emit a baseline-missing finding only for nonzero balances with neither baseline nor opening event.
- [x] **Step 4: Run the focused test, then add a failing drift case covering positive/negative deltas and the missing-baseline case; implement only that behavior and rerun.**

### Task 2: Read one bounded tenant page from PostgreSQL

**Files:**
- Create: `apps/backend/src/modules/ledger/infrastructure/typeorm-ar-reconciliation-query.ts`
- Create: `apps/backend/test/ar-reconciliation-query.e2e-spec.ts`
- Modify: `apps/backend/src/modules/ledger/ledger.module.ts`

**Interface:**
- `TypeOrmArReconciliationQuery` implements the application port with one parameterized SQL statement. It returns a keyset page ordered by subject type and UUID, aggregates only active allocations, sums signed ledger events, and identifies baseline/opening events.

- [x] **Step 1: Write an integration test** using PostgreSQL with two organizations, matching rows, deliberate allocation/ledger drift, one missing nonzero baseline, and more subjects than the requested limit.
- [x] **Step 2: Run it and confirm the query adapter is unavailable.**
- [x] **Step 3: Implement the single-statement CTE query.** Filter every source table by the requested organization, exclude undone allocations, fetch `limit + 1` candidates, and aggregate only the returned page.
- [x] **Step 4: Run the integration test and confirm findings inputs, tenant isolation, continuation, and completion.**

### Task 3: Expose the protected report endpoint

**Files:**
- Create: `apps/backend/src/modules/ledger/presentation/dto/ar-reconciliation-query.dto.ts`
- Create: `apps/backend/src/modules/ledger/presentation/dto/ar-reconciliation-response.dto.ts`
- Create: `apps/backend/src/modules/ledger/presentation/ledger-reconciliation.controller.ts`
- Create: `apps/backend/src/modules/ledger/presentation/ledger-reconciliation.controller.spec.ts`
- Modify: `apps/backend/src/modules/ledger/ledger.module.ts`

**Interface:**
- `GET /api/v1/ledger/reconciliation?cursor=<subjectType>:<subjectId>&limit=100` is guarded by JWT and `RECEIVABLE_AUDIT_READ`.
- The response contains only this page's findings plus `nextCursor` and `complete`; do not return another tenant's rows or add a UI.

- [x] **Step 1: Write a failing controller test** for the permission and request-to-use-case mapping.
- [x] **Step 2: Run it and confirm the controller is unavailable.**
- [x] **Step 3: Add validated DTOs, the Swagger-documented controller, and module wiring.**
- [x] **Step 4: Run focused unit/integration tests and backend typecheck.**

### Task 4: Verify, review, and commit

**Files:**
- Review all changed files against issue #424 and `AGENTS.md`.

- [x] Run the backend unit suite, focused PostgreSQL integration test, backend typecheck, `pnpm verify`, and `/domain-check` freshly.
- [x] Run the code-review skill on the diff from `origin/main` and resolve findings.
- [x] Verify the final diff and commit as `feat: add AR balance reconciliation report`.
