# 16. Batch endpoints process items independently, never as one all-or-nothing transaction

Date: 2026-08-14

## Status

Accepted

## Context

Issue #134 asked for batch operations on the Exception Queue (`batch-match`, `batch-skip`, `batch-mark-prepaid`) and Receivables (`batch-write-off`, `batch-cancel`), explicitly requiring "per-row failure reporting." A grilling session considered two designs: wrap every item of a batch request in one database transaction (all-or-nothing — a single item's failure rolls back the whole batch), or process each item in its own transaction, independent of the others, and report a per-item result.

`AGENTS.md`'s transaction-scope rule ("keep transactions as short as possible... hold locks only inside transactions, never outside") already argues against a single long transaction spanning up to 50 items — `batch-match` in particular takes a pessimistic lock on each receivable it allocates against, and each item's `MatchBankTransactionUseCase` already runs in its own transaction.

## Decision

Every batch endpoint reuses the existing single-item use case unchanged, once per item, each in its own transaction. One item's failure (e.g. `ALLOCATION_EXCEEDS_REMAINING`, a stale `version`, tenant mismatch) is caught and recorded in that item's result; the loop continues to the next item. The response is `{ results: [{ id, status: 'success' | 'error', data?, errorCode?, message? }] }`, one entry per input item, in input order.

- Explicitly rejected: a single `dataSource.transaction()` wrapping the whole batch. This would make partial failure impossible to report per the issue's requirement (a rolled-back item's siblings would also roll back), and would hold every item's row lock for the duration of the entire batch instead of just its own item.
- Idempotency: the whole batch is one idempotent unit under a single `Idempotency-Key` (via the existing `IdempotencyService`, unchanged) — retrying a batch request replays the same per-item results rather than re-running already-applied items.

## Consequences

- A batch response can be a mix of `success` and `error` entries — callers (the FE bulk action bar) must handle partial success, not treat the HTTP response as pass/fail for the whole request.
- No cross-item atomicity: if the caller needs "all 50 succeed or none do," this design does not provide it. That was a deliberate trade against issue #134's explicit per-row reporting requirement — introducing that guarantee later would be a breaking response-shape change for any FE code already handling partial results.
- Locks are held only per-item, not for the batch's full duration, keeping contention in line with the existing single-item endpoints.
