# Receivable Balance History

**Status:** design agreed

**Related issues:** #172 (this issue), #135 (consumer)

## Context

Issue #135 needs an end-of-period `outstanding` trend. The persisted `Receivable.paidAmount`
is only the current rollup, and the repository rule forbids reconstructing historical
balances with a runtime `SUM(payment_allocations)` query.

This issue adds the prerequisite data model and write path: an append-only
`receivable_balance_history` table plus a month-end outstanding query port that #135's
trend service consumes.

## Goals

- Record every receivable balance/status transition as an immutable, timestamped row.
- Write the history row in the **same database transaction** as the receivable mutation.
- Provide a tenant-scoped, parameterized query that returns the receivable balance as of
  arbitrary month-end cutoffs, without any runtime aggregation of `payment_allocations`.
- Keep the exact query contract that #135 is waiting for.

## Non-goals

- No reconstruction of periods before rollout; a one-time rollout baseline snapshots
  the current state of existing receivables, while months before that baseline return
  `outstanding: null`.
- No frontend or reporting endpoint in this issue.
- No change to the receivable state machine or to payment/allocation semantics.
- No runtime `SUM(payment_allocations)` anywhere.

## Dependency contract with #135

The module exports this application-layer port (verbatim from the #135 plan):

```ts
export interface HistoricalOutstandingPoint {
  month: string; // YYYY-MM in Asia/Ho_Chi_Minh
  outstanding: string | null;
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

`monthEnds` are the last instants of each month in `Asia/Ho_Chi_Minh` (UTC instants).
The query returns every requested month, oldest to newest; months with no history rows
at or before the cutoff (pre-rollout) return `outstanding: null`; covered months return
the sum of the latest per-receivable `remainingAmount` for receivables whose latest
recorded status is `OPEN` or `PARTIALLY_PAID` (zero when all such balances are zero).
Month keys are derived in SQL with the same timezone so they always match the caller's
`date-fns-tz` keys.

## Data model

`receivable_balance_history` — append-only; rows are never updated or deleted.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | generated in the application layer |
| `sequence` | bigserial | strict append order; tiebreak when two rows share an instant |
| `organizationId` | varchar | tenant scoping |
| `receivableId` | uuid | the receivable whose balance changed |
| `status` | enum `ReceivableStatus` | status after the transition |
| `remainingAmount` | bigint | immutable historical snapshot of `originalAmount - paidAmount` at the transition instant (integer VND) — not a current derived field; never updated after insert |
| `effectiveAt` | timestamptz | when the balance became effective (transition time) |
| `changeSource` | enum/varchar | `CREATE`, `ALLOCATE`, `UNDO`, `CANCEL`, `WRITE_OFF`, `ROLLOUT_BASELINE` |
| `changeReason` | varchar nullable | e.g. the payment-allocation id for `ALLOCATE`/`UNDO` |
| `createdAt` | timestamptz | insert time |

Indexes:

- `(organizationId, effectiveAt)` — month-end time-range scans.
- `(organizationId, receivableId, effectiveAt)` — per-receivable history walks.
- unique partial `(organizationId, receivableId)` where `changeSource = 'ROLLOUT_BASELINE'`
  — one baseline snapshot per receivable for the rollout epoch.

Check constraint: `"remainingAmount" >= 0`.

`receivable_balance_history_coverage` stores the one current coverage epoch per
organization. Its `coveredFrom` timestamp is the rollout boundary used by the
historical query; history rows before that instant are ignored, so they cannot
make pre-rollout months appear covered. The rollout reason is
`HISTORY_COVERAGE_START`.

### Transition semantics

| Transition | Recorded status | Recorded remaining | Source |
|------------|-----------------|---------------------|--------|
| create | `OPEN` | `originalAmount` | `CREATE` |
| allocate | `PARTIALLY_PAID` or `PAID` | decreased by the allocation | `ALLOCATE` |
| undo allocation | `PARTIALLY_PAID` or `OPEN` (reopened from `PAID`) | increased by the allocation | `UNDO` |
| cancel | `CANCELLED` | unchanged (`paidAmount` is always 0 here) | `CANCEL` |
| write-off | `WRITTEN_OFF` | unchanged | `WRITE_OFF` |

`CANCELLED` and `WRITTEN_OFF` are terminal: their rows stop the receivable from
counting toward outstanding at any later cutoff. `PAID` is not terminal — an undo
reopens the receivable and appends a `PARTIALLY_PAID`/`OPEN` row.

## Write path

All receivable mutations already run inside a transaction with a pessimistic lock on the
receivable (`findByIdForUpdate`), so history appends serialized on the receivable row are
automatically consistent: concurrent allocate/undo operations cannot interleave their
history rows out of order.

A `ReceivableBalanceHistoryRecorderService` in the history module's application layer
builds the entry from the post-transition domain `Receivable` and appends it through the
write port with the same `EntityManager` the use case is already using:

```ts
export const RECEIVABLE_BALANCE_HISTORY_REPOSITORY = Symbol(
  'RECEIVABLE_BALANCE_HISTORY_REPOSITORY',
);

export interface IReceivableBalanceHistoryRepository {
  append(
    entry: ReceivableBalanceHistoryEntry,
    manager?: EntityManager,
  ): Promise<void>;
}
```

Hook points (one call each, after the receivable save, inside the existing transaction):

1. `CreateReceivableUseCase` — `record(receivable, CREATE, manager)`
2. `AllocatePaymentUseCase.allocateWithinTransaction` — `record(updatedReceivable, ALLOCATE, manager, allocation.id)`
3. `UndoPaymentAllocationUseCase` — `record(updatedReceivable, UNDO, manager, allocation.id)`
4. `CancelReceivableUseCase` — `record(next, CANCEL, manager)`
5. `WriteOffReceivableUseCase` — `record(updated, WRITE_OFF, manager)`

Batch cancel/write-off and the webhook/exception-queue allocation flows delegate to these
use cases, so they are covered without extra wiring. Payment creation without allocation
does not change a receivable balance and records nothing.

The rollout producer is a TypeORM migration that runs during the maintenance-window
cutover. It inserts one `ROLLOUT_BASELINE` row for every existing receivable, including
closed and draft statuses, with the current `remainingAmount` and one shared
`CURRENT_TIMESTAMP`. It explicitly opts into a TypeORM transaction and takes a
`SHARE` table lock on `receivables` before reading, so in-flight transitions finish
first and new amount/status writes wait until the cutover commits. The migration is
guarded by the partial unique index and `NOT EXISTS` check so a retry is idempotent;
a failure rolls back the entire baseline. It does not reconstruct any period before
the baseline.

Atomicity: the history row participates in the same DB transaction as the receivable
mutation — if the use case later throws (or the transaction rolls back), the history row
rolls back with it. No external API is called inside any of these transactions.

## Query implementation

One parameterized SQL query over the requested month ends:

1. `unnest($2::timestamptz[])` builds the requested months; the month key is
   `to_char(month_end AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')`.
2. Load the organization's `coveredFrom` epoch and ignore history rows before it.
3. For each `(receivable, month)` keep the latest row with `effectiveAt <= month_end`
   (`DISTINCT ON`, ordered by `effectiveAt DESC, sequence DESC`).
4. Sum `remainingAmount` filtered to `OPEN`/`PARTIALLY_PAID` latest states per month.
5. Months before the coverage epoch return
   `outstanding: null`; covered months return the sum (0 when no open balances).

The query preserves exact VND amounts as base-10 integer strings and `null` stays `null`.
The list query must select the stored bigint snapshot as text before the process-wide
bigint parser runs. Aggregate results remain PostgreSQL numeric/text values. The query is
tenant-scoped by `$1`, selects explicit columns only, and never touches
`payment_allocations`.

## Architecture

New Clean Architecture module `apps/backend/src/modules/receivable-balance-history/`:

- `domain/` — `receivable-balance-history-entry.ts` (data interface),
  `balance-history-change-source.ts` (enum). No NestJS/TypeORM imports.
- `application/` — `receivable-balance-history.repository.port.ts` (write port + symbol),
  `receivable-balance-history-query.port.ts` (#135 contract + symbol),
  `receivable-balance-history-recorder.service.ts`.
- `infrastructure/` — `receivable-balance-history.orm-entity.ts`,
  `typeorm-receivable-balance-history.repository.ts` (append with manager support),
  `typeorm-receivable-balance-history-query.ts` (month-end outstanding SQL + row mapper).
- `receivable-balance-history.module.ts` — `@Global()` (same precedent as the Audit
  module), provides and exports both tokens plus the recorder service.

Consumers (receivables/payments use cases, and later the reporting module) depend only on
the application ports — no ORM entity imports outside infrastructure.

## Testing

Unit (RED → GREEN per behavior):

- Recorder service: builds the entry from a post-transition `Receivable`
  (status, remaining, source, reason) and delegates to the write port.
- Write repository: `append` saves through the passed `EntityManager`
  (tenant-mismatch guard included).
- Query repository: parameter passing (`org`, month-end instants), mapping of
  bigint strings, `null` for uncovered months, covered-zero for paid-out months.
- Use-case hooks: create/cancel/write-off/allocate/undo each append one history entry
  inside the transaction with the post-transition receivable state.
- Rollout migration: existing receivables receive one baseline row, and rerunning it
  does not duplicate that row.

Postgres integration (new `receivable-balance-history.integration.spec.ts`):

The suite boots the full `AppModule`, whose BullMQ workers require Redis during
Nest application initialization. It starts an ephemeral Redis container only as
that bootstrap dependency; no Redis behavior is under test.

- create → `OPEN` row with `remainingAmount = originalAmount`;
- allocate → decreased remaining; full allocation → `PAID` row; `closedAt` recorded;
- undo from `PAID` reopens the receivable (`PARTIALLY_PAID`/`OPEN`) and appends a row;
- cancel and write-off append terminal rows and stop the receivable from counting;
- a failing allocation (amount exceeds remaining) rolls back both the receivable and
  the history row;
- tenant isolation: a second organization's history is invisible;
- `findOutstandingByMonthEnds`: month keys in `Asia/Ho_Chi_Minh`, null for pre-rollout
  months, exact sums across multiple receivables and cutoffs, zero for all-paid months,
  and every requested month returned in order.

## Rollout

The table ships as a TypeORM migration for production plus the entity for
`synchronize` in dev/test. A follow-up production migration performs the one-time
baseline during the maintenance window. History coverage begins at that baseline;
months before it remain a data gap (`outstanding: null`), while later transitions append
normal snapshots.
