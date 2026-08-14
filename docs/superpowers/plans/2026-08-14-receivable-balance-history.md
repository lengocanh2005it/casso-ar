# Receivable Balance History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an append-only `receivable_balance_history` table, write it atomically inside every receivable balance/status transition, and expose the month-end outstanding query port that issue #135 consumes.

**Architecture:** A new `@Global()` Clean Architecture module `receivable-balance-history` (domain → application → infrastructure). Use cases in the receivables/payments modules inject the application write port through a small recorder service; the reporting module (later, in #135) consumes the query port. History rows are written with the same `EntityManager` and inside the same transaction and pessimistic lock as the receivable mutation.

**Tech Stack:** NestJS 11, TypeORM, Jest/Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-14-receivable-balance-history-design.md`

## Global Constraints

- All money stays integer VND (`bigint` columns, `Number()` coercion for pg bigint strings).
- Every query/write is tenant-scoped by `TenantContextService.getOrganizationId()` / `organizationId`.
- Never reconstruct historical balances with `SUM(payment_allocations)` at runtime.
- Rollout baseline snapshots current receivable state once; it does not reconstruct
  periods before the rollout boundary.
- History rows are append-only: never updated or deleted.
- `remainingAmount` in a history row is an immutable historical snapshot at the transition
  instant (AGENTS.md "Derived Fields" exception), never a current derived field.
- No external API calls inside transactions.
- No `any` / unsafe casts in production code; explicit mappers only.
- The #135 query contract (`HistoricalOutstandingPoint`, `IReceivableBalanceHistoryQuery`, `RECEIVABLE_BALANCE_HISTORY_QUERY`) is defined verbatim in `application/receivable-balance-history-query.port.ts`.
- Follow RED → GREEN → REFACTOR for every behavior change; tests sit beside source or in `apps/backend/test/` for integration.
- Before completion claims: fresh focused tests, the affected unit suites, the new integration suite, `pnpm verify`, and the domain-check checklist.

---

### Task 1: History domain, ports, ORM entity, write repository, recorder, and module

**Files:**
- Create: `apps/backend/src/modules/receivable-balance-history/domain/receivable-balance-history-entry.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/domain/balance-history-change-source.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history.repository.port.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-query.port.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-recorder.service.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/application/receivable-balance-history-recorder.service.spec.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/infrastructure/receivable-balance-history.orm-entity.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history.repository.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history.repository.spec.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/receivable-balance-history.module.ts`

**Interfaces:**

```ts
export enum BalanceHistoryChangeSource {
  CREATE = 'CREATE',
  ALLOCATE = 'ALLOCATE',
  UNDO = 'UNDO',
  CANCEL = 'CANCEL',
  WRITE_OFF = 'WRITE_OFF',
}

export interface ReceivableBalanceHistoryEntry {
  id: string;
  organizationId: string;
  receivableId: string;
  status: ReceivableStatus;
  remainingAmount: number;
  effectiveAt: Date;
  changeSource: BalanceHistoryChangeSource;
  changeReason: string | null;
  createdAt: Date;
}

export const RECEIVABLE_BALANCE_HISTORY_REPOSITORY = Symbol(
  'RECEIVABLE_BALANCE_HISTORY_REPOSITORY',
);

export interface IReceivableBalanceHistoryRepository {
  append(entry: ReceivableBalanceHistoryEntry, manager?: EntityManager): Promise<void>;
}
```

The recorder service exposes `record(receivable, changeSource, manager?, changeReason?)`, builds the entry from the post-transition domain `Receivable` (status, `remainingAmount = originalAmount - paidAmount`, `effectiveAt = new Date()`, org from the receivable), and delegates exactly once to `IReceivableBalanceHistoryRepository.append(entry, manager)`.

The query port file contains the #135 contract verbatim (see the spec) plus the `RECEIVABLE_BALANCE_HISTORY_QUERY` symbol.

The ORM entity mirrors `payment_allocations` conventions: uuid PK, `@Index(['organizationId','effectiveAt'])`, `@Index(['organizationId','receivableId','effectiveAt'])`, `@Check('"remainingAmount" >= 0')`, money as `@Column('bigint')`, `timestamptz` columns, and a `bigserial` `sequence` column for append-order tiebreaks.

The write repository's `append` uses `manager.getRepository(ReceivableBalanceHistoryOrmEntity)` when a manager is passed, mirrors the tenant guard from the payment-allocation repository, and never returns the entity.

The module is `@Global()`, provides `RECEIVABLE_BALANCE_HISTORY_REPOSITORY` + the query provider + the recorder service, and exports both tokens and the service.

- [ ] **Step 1: Write the failing recorder/repository tests**

```ts
it('records the post-transition status and remaining amount with the change source', async () => {
  // record(PAID receivable, ALLOCATE, manager, 'alloc-1')
  // expect repo.append entry { status: 'PAID', remainingAmount: 0, changeSource: 'ALLOCATE', changeReason: 'alloc-1' }
});

it('appends through the passed EntityManager with the tenant guard', async () => {
  // expect manager.getRepository(ReceivableBalanceHistoryOrmEntity).save(...)
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

From `apps/backend`:

```bash
pnpm exec jest --runInBand src/modules/receivable-balance-history/application/receivable-balance-history-recorder.service.spec.ts src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history.repository.spec.ts
```

Expected: FAIL because the module files do not exist.

- [ ] **Step 3: Implement the smallest contract, recorder, entity, and repository**

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same Jest command. Expected: all recorder and repository tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/receivable-balance-history
git commit -m "feat: add receivable balance history ledger module"
```

### Task 2: Record history on create, cancel, and write-off

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/create-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`

**Interfaces:**
- Consumes: `ReceivableBalanceHistoryRecorderService` (injected alongside the existing deps).
- Produces: one history entry per transition, inside the existing transaction and manager.

Each use case calls `recorder.record(<post-transition receivable>, SOURCE, manager)` after its `receivableRepo.save(...)` and before the transaction returns.

- [ ] **Step 1: Add failing use-case tests**

```ts
it('records the created receivable balance history', async () => {
  // expect recorder.record(created, 'CREATE', expect.anything())
});

it('records the cancelled receivable balance history', async () => {
  // expect recorder.record(cancelled, 'CANCEL', manager)
});

it('records the written-off receivable balance history', async () => {
  // expect recorder.record(writtenOff, 'WRITE_OFF', manager)
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec jest --runInBand src/modules/receivables/application/create-receivable.usecase.spec.ts src/modules/receivables/application/cancel-receivable.usecase.spec.ts src/modules/receivables/application/write-off-receivable.usecase.spec.ts
```

Expected: FAIL because the recorder is not injected or not called.

- [ ] **Step 3: Inject the recorder and record inside the transactions**

Keep constructor behavior of existing tests intact except for the new parameter.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same Jest command. Expected: all three use-case suites pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/receivables/application
git commit -m "feat: record balance history on receivable create, cancel, write-off"
```

### Task 3: Record history on allocation and undo

**Files:**
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts`
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`

**Interfaces:**
- Consumes: `ReceivableBalanceHistoryRecorderService`.
- Produces: `ALLOCATE` rows with `changeReason = allocation.id`; `UNDO` rows with `changeReason = allocation.id`.

In `allocateWithinTransaction`, capture the `PaymentAllocation` in a variable, save it, then call `recorder.record(updatedReceivable, ALLOCATE, manager, allocation.id)`. In the undo use case, call `recorder.record(updatedReceivable, UNDO, manager, allocation.id)` after the receivable save, alongside the existing in-transaction audit write.

- [ ] **Step 1: Add failing use-case tests**

```ts
it('records the allocated balance history with the allocation id as reason', async () => {
  // expect recorder.record(updatedReceivable, 'ALLOCATE', manager, allocationId)
});

it('records the undone balance history with the allocation id as reason', async () => {
  // expect recorder.record(reopenedReceivable, 'UNDO', manager, allocationId)
});

it('does not record history when the allocation fails', async () => {
  // allocate beyond remaining -> recorder.record not called, transaction rolls back
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec jest --runInBand src/modules/payments/application/allocate-payment.usecase.spec.ts src/modules/payments/application/undo-payment-allocation.usecase.spec.ts
```

Expected: FAIL because the recorder is not injected or not called.

- [ ] **Step 3: Inject the recorder and record inside the transactions**

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same Jest command. Expected: both payment suites pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/application
git commit -m "feat: record balance history on allocation and undo"
```

### Task 4: Month-end outstanding query

**Files:**
- Create: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.ts`
- Create: `apps/backend/src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.spec.ts`
- Modify: `apps/backend/src/modules/receivable-balance-history/receivable-balance-history.module.ts`

**Interfaces:**
- Consumes: `IReceivableBalanceHistoryQuery` / `RECEIVABLE_BALANCE_HISTORY_QUERY` from Task 1.
- Produces: `HistoricalOutstandingPoint[]` for every requested month end, oldest to newest.

Use `@InjectDataSource()` and one parameterized `DataSource.query` with the CTE shape from the spec: `unnest($2::timestamptz[])` for month ends, `to_char(... AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')` for keys, `DISTINCT ON (receivableId, month_key)` ordered by `effectiveAt DESC, sequence DESC` for the latest per-receivable state, `SUM(remainingAmount) FILTER (WHERE status IN ('OPEN','PARTIALLY_PAID'))`, and a coverage `EXISTS` so uncovered months return `outstanding: null`.

The row mapper converts the `outstanding` bigint string to a number and keeps `null` as `null`.

- [ ] **Step 1: Write failing query tests**

```ts
it('passes the organization and month-end instants as parameters', async () => {
  // expect dataSource.query(sql, ['org-1', [date1, date2]])
});

it('maps bigint outstanding to numbers and keeps null for uncovered months', async () => {
  // mock [{ month: '2026-06', outstanding: null }, { month: '2026-07', outstanding: '123000' }]
  // expect [{ month: '2026-06', outstanding: null }, { month: '2026-07', outstanding: 123000 }]
});

it('returns every requested month in order', async () => {
  // expect the result months to match the requested order
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec jest --runInBand src/modules/receivable-balance-history/infrastructure/typeorm-receivable-balance-history-query.spec.ts
```

Expected: FAIL because the query implementation does not exist.

- [ ] **Step 3: Implement the parameterized query and explicit mapper**

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Jest command. Expected: all query mapping and parameter assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/receivable-balance-history
git commit -m "feat: query month-end receivable outstanding"
```

### Task 5: Migration, integration coverage, and full verification

**Files:**
- Create: `apps/backend/src/database/migrations/20260820000000-add-receivable-balance-history.ts`
- Create: `apps/backend/src/database/migrations/20260822000000-add-receivable-balance-history-rollout-baseline.ts`
- Create: `apps/backend/test/receivable-balance-history.integration.spec.ts`
- Modify (only if verification finds a defect): files from Tasks 1–4.
- Modify: `docs/wayfinder/feature-map.md` (status → done after merge, or in-progress while open)

**Interfaces:**
- Consumes: the full ledger module from Tasks 1–4 plus the existing receivables/payments modules.
- Produces: production migration + end-to-end Postgres evidence for every acceptance criterion.

Migration: raw SQL `CREATE TABLE` matching the entity (columns, enum, check, both indexes) and a symmetric `DROP` in `down`, following the existing `YYYYMMDDHHMMSS-add-*.ts` style.

The rollout migration explicitly runs in one TypeORM transaction, first taking a
`SHARE` lock on `receivables` so transitions cannot interleave with the baseline. It
creates the unique partial baseline index and inserts one `ROLLOUT_BASELINE` snapshot
for every existing receivable using the current status and `originalAmount - paidAmount`.
`NOT EXISTS` plus the unique index makes a retry idempotent. Its `down` removes only the
index; immutable financial snapshots are never deleted.

Integration suite (testcontainers Postgres, `AppModule`): seed a user, membership, customer, and receivables, then assert:

- create appends an `OPEN` row with `remainingAmount = originalAmount`;
- a full allocation appends a `PAID` row with `remainingAmount = 0`;
- a partial allocation appends a `PARTIALLY_PAID` row with the decreased remaining;
- undo of the partial allocation restores the remaining and appends an `UNDO` row;
- undo after `PAID` reopens the receivable (`PARTIALLY_PAID`/`OPEN`) and appends a row;
- cancel and write-off append terminal rows that stop the receivable from counting;
- a failing allocation (amount exceeds remaining) leaves no history row (atomicity);
- tenant isolation: a second organization's requests never see the fixture rows;
- `findOutstandingByMonthEnds` (injected from the app): month keys in `Asia/Ho_Chi_Minh`, `null` for pre-rollout months, exact sums across cutoffs, zero for all-paid months, all requested months returned in order.
- rollout baseline: every existing receivable gets one current-state snapshot, including
  terminal/draft statuses, and rerunning the migration creates no duplicate snapshot.

- [ ] **Step 1: Run the focused unit suites**

```bash
pnpm exec jest --runInBand src/modules/receivable-balance-history src/modules/receivables/application src/modules/payments/application
```

Expected: all ledger, receivables, and payments unit suites pass.

- [ ] **Step 2: Write and run the integration suite**

```bash
pnpm exec jest --config ./test/jest-e2e.json --runInBand test/receivable-balance-history.integration.spec.ts
```

Expected: every acceptance criterion above passes against Postgres.

- [ ] **Step 3: Run backend domain and architecture checks**

From `apps/backend`:

```text
/domain-check
pnpm run arch-check
```

Expected: no domain-rule or Clean Architecture violations.

- [ ] **Step 4: Run the repository verification gate**

From the repository root:

```bash
pnpm verify
```

Expected: lint, type-check, unit tests, and architecture checks complete successfully. If an unrelated existing failure remains, record the exact command/output and do not claim a clean gate.

- [ ] **Step 5: Inspect the final diff and worktree state**

```bash
git diff main...HEAD --stat
git status --short --branch
```

Confirm no `.env` files are tracked and the diff contains only the #172 implementation plus required docs/tests.

- [ ] **Step 6: Commit any final verification fixes**

```bash
git add <only the files changed by verification fixes>
git commit -m "test: verify receivable balance history"
```

Do not stage `.env` files or unrelated changes.

Do not push or open a PR until the user reviews the branch and explicitly asks for publication.
