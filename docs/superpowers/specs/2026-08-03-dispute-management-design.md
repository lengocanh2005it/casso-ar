# Dispute Management Design

> Child spec of [docs/overview.md](../../../docs/overview.md), modifying [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md)—replaces the directly stored `Receivable.isDisputed` field with a separate `Dispute` entity plus a computed field, and affects [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (the reminder-skip condition).

## 1. Entity Dispute

```
Dispute
  id, organizationId, receivableId,
  reason, status (OPEN/RESOLVED),
  openedByUserId, createdAt, resolvedAt, resolvedByUserId

Receivable.isDisputed (computed, not stored in DB) =
  EXISTS(Dispute WHERE receivableId = Receivable.id AND status = 'OPEN')
```

The MVP does not model `assignedToUserId` or `resolutionNote`; if assignment or resolution notes are needed, add nullable fields and a migration in a later phase.

A `Receivable` may have multiple `Dispute` records over time (open → resolve → reopen when a new dispute arises); each occurrence is a separate record preserving history (who opened/resolved it and why), rather than overwriting one boolean flag. At most one `Dispute.status = OPEN` may exist at any time; the use case checks before insert and the database partial unique index `(receivableId) WHERE status = 'OPEN'` prevents race conditions.

## 2. Lifecycle

```
Create Dispute (status=OPEN, reason, openedByUserId)
  → Reminder Automation (using computed isDisputed) automatically skips this receivable on the next scan

Resolve Dispute (status=RESOLVED, resolvedAt=now, resolvedByUserId)
  → if no other Dispute for that receivable has status OPEN → isDisputed automatically becomes false
  → Reminder Automation evaluates rules normally on the next scan; no other manual action is needed
```

## 3. Domain Core spec update

`Receivable` in [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) no longer stores `isDisputed`, `disputeReason`, or `disputedAt` directly. These three fields are replaced by the computed `isDisputed` field referencing the `Dispute` table as described in section 1. This avoids two sources of truth (the Receivable field versus the Dispute record) drifting when one side is not manually synchronized.

## 4. Out of scope

- Detailed dispute-handling page UI (described in sections 7.12 and 18 of the original document).
- Assignment and resolution notes in the entity (deferred from the MVP).
- Automatic escalation based on dispute-resolution deadlines (Internal Task/Escalation—section 7.14 of the original document; separate spec if needed).

## 5. Open questions (do not block implementation)

- If assignment/resolution notes are needed after the MVP, finalize permissions and the field contract in a separate ADR/plan.
- Should `Dispute` track a resolution deadline to warn about overdue handling, or are the simple OPEN/RESOLVED states enough for the MVP?
