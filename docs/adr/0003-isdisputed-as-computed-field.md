# 3. `isDisputed` is a computed field from the `Dispute` table, not stored directly on `Receivable`

Date: 2026-08-03

## Status

Accepted

Supersedes the `isDisputed`, `disputeReason`, and `disputedAt` sections in the first version of [`domain-core-design.md`](../superpowers/specs/2026-08-03-domain-core-design.md).

## Context

The initial Domain Core design stored `isDisputed`, `disputeReason`, and `disputedAt` directly as fields on `Receivable`. During Dispute Management design, a `Receivable` turned out to support **multiple `Dispute` records over time** (open → resolve → reopen), with each occurrence represented by a separate record to preserve the complete history (who handled it, the reason, and the resolution) — three standalone boolean/text fields on `Receivable` cannot represent that history.

Keeping both — the field on `Receivable` *and* a separate `Dispute` table — would mean two sources of truth for the same information, requiring manual synchronization at every write (open dispute, close dispute, reopen) and making drift likely if one location is missed.

## Decision

Remove `isDisputed`, `disputeReason`, and `disputedAt` from the `Receivable` table. `isDisputed` becomes a **computed field**, calculated at query time:

```
isDisputed = EXISTS(Dispute WHERE receivableId = this.id AND status = 'OPEN')
```

The response DTO may expose `isDisputed` to the FE, but the value must be produced from `EXISTS`/`hasOpenDispute` on the read path; do not add an `isDisputed` column to `ReceivableOrmEntity` or copy dispute status onto `Receivable`.

The primary `Receivable` `status` (`OPEN`/`PARTIALLY_PAID`/...) remains unchanged when a dispute exists — a dispute only pauses reminders; it does not block payment/matching.

## Consequences

- There is one source of truth (`Dispute` table) for dispute status — no risk of a `Receivable` field drifting from a `Dispute` record because synchronization was missed in one place.
- Every place that filters/displays `isDisputed` (reminder cron, aging dashboard, receivable list) must JOIN or subquery `Dispute` instead of reading a column directly — this adds query cost compared with reading a boolean field, so `Dispute` needs an index on `(receivableId, status)` to avoid slowing large lists.
- This change revises the previously written Domain Core spec — any code/migration created from the original field-on-Receivable version must be updated to follow this decision.
