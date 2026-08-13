# Idempotency-Key PENDING rows are reclaimed as stale after 5 minutes

**Context:** `idempotency_keys` rows created as `PENDING` are only deleted on the
error path (`idempotency.service.ts`) — if the process dies mid-operation, the
row leaks forever, and every retry with the same `Idempotency-Key` is
permanently rejected as "already being processed" (issue #118).

**Decision:** A `PENDING` row older than 5 minutes is treated as abandoned. A
retry request that finds a stale `PENDING` row deletes it and re-executes the
operation immediately (fail-fast, at request time); a daily retention job also
sweeps stale `PENDING` rows as a backstop.

**Trade-off:** this weakens the idempotency guarantee for a legitimate
operation that is still genuinely running past 5 minutes (e.g. a slow
downstream call to Cas ID/Resend) — a retry in that window can trigger a
second, concurrent execution of the same side effect. 5 minutes was chosen as
a threshold well beyond normal request latency, accepting that rare
long-running requests trade strict idempotency for bounded PENDING leakage,
rather than leaving every crashed request locked out forever.
