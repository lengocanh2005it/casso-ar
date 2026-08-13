# 15. `IdempotencyKey` rows in `PENDING` are reclaimed as stale after 5 minutes

Date: 2026-08-13

## Status

Accepted

## Context

Issue #118 found that `idempotency_keys` rows are only deleted on the error
path (`idempotency.service.ts`) — if the process dies mid-operation, the row
is never cleaned up. The unique index on `(organizationId, endpoint, key)`
means every retry with the same `Idempotency-Key` then permanently reads that
row as `PENDING` ("another request is executing this key") and is rejected
with 409, with no path back to a working state short of a manual DB fix.

A retention-policy grilling session for issue #118 considered two fixes:
sweeping stale `PENDING` rows only from the daily retention job (bounded by
the job's schedule, up to ~24h of lockout), or reclaiming stale `PENDING` at
request time, when a retry actually hits the stuck key. Bounding lockout to
the job's cadence was judged too slow for an in-request retry path.

## Decision

A `PENDING` row older than 5 minutes is treated as abandoned:

1. **Request-time reclaim** — `IdempotencyService.execute` deletes a stale
   `PENDING` row it finds and re-executes the operation immediately, instead
   of rejecting with 409.
2. **Daily retention job backstop** — the same 5-minute threshold sweeps any
   stale `PENDING` rows nobody happens to retry (see issue #118's broader
   retention job for `webhook_inbox`, `audit_logs`, etc.).

5 minutes was picked as comfortably beyond normal request latency (including
outbound calls to Cas ID/Resend), not as a value with a principled derivation.

## Consequences

- **Weakens strict idempotency for slow-but-alive requests.** If the original
  `operation()` is still genuinely running past 5 minutes, a retry reclaims
  the row and executes the operation a second time, concurrently — the
  guarantee this whole mechanism exists to provide (no duplicate side effect)
  can be violated in that narrow window. This is accepted as rarer and less
  harmful than every crashed request being locked out forever.
- Any endpoint whose `operation()` can legitimately run longer than 5 minutes
  needs a longer threshold or a different mechanism — this ADR's number is
  not safe to assume for every future idempotent endpoint.
- Whoever implements issue #118's retention job must reuse the same 5-minute
  constant rather than picking a second, independent number for the sweep.
