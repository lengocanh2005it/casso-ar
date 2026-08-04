# 2. Persisted rollup for `paidAmount`/`allocatedAmount` instead of runtime calculation from `PaymentAllocation`

Date: 2026-08-03

## Status

Accepted

## Context

`PaymentAllocation` records payment-allocation history (the source of truth), with an N-N relationship between `Payment` and `Receivable`. There are two ways to determine the current balance of a `Receivable` (`paidAmount`) or the allocated portion of a `Payment` (`allocatedAmount`):

- **Runtime calculation**: `SUM(PaymentAllocation.allocatedAmount)` whenever a balance is read — always consistent with the source of truth because there is no other copy, but every read path (receivable list, aging dashboard, reporting) must aggregate a potentially very large table.
- **Persisted rollup**: store `paidAmount`/`allocatedAmount` directly on `Receivable`/`Payment`, updating them in the same transaction as each allocation/undo.

The original Domain Core spec conflicted between these approaches across different plan versions — this is why the decision must be made explicit and documented, so later plans do not continue to diverge.

## Decision

`paidAmount` (on `Receivable`) and `allocatedAmount` (on `Payment`) are **persisted rollups**, updated in the same transaction with a row lock for every allocation/undo. `remainingAmount` and `unallocatedAmount` are derived fields (simple subtraction, not stored). `PaymentAllocation` remains the source of truth for history — rollups must not be modified by any path other than the allocation/undo transaction, and a DB check constraint protects the invariant (`0 <= paidAmount <= originalAmount`, `0 <= allocatedAmount <= totalAmount`).

Do not use `SUM(PaymentAllocation)` as the runtime balance on any read path.

## Consequences

- Read paths (list, aging dashboard, reporting) read only one integer column on `Receivable`/`Payment`, without a JOIN and aggregate over `PaymentAllocation` — important because these are the application's most frequently run queries.
- In return, every write path that changes an allocation (allocate, undo, write-off) must update the rollup correctly in the same locked transaction; missing an allocation write outside the standard use case will make the rollup diverge from `PaymentAllocation` — a hard-to-detect bug class (incorrect figures without an obvious error) without strict tests/invariant checks.
- Because this is a data structure (stored columns), reversing it later (removing rollups and switching entirely to runtime calculation) requires a backfill/migration and changes to every dependent read path — it is not a cheap change.
- `AllocatePaymentUseCase` and auto-match/Exception Queue must all use the same shared allocation core in Domain Core so no path updates rollups differently.
