# Internal Task & Escalation Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md) (section 7.14), dependent on [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (reuse the daily cron), [2026-08-03-multi-tenancy-rbac-design.md](2026-08-03-multi-tenancy-rbac-design.md) (task-creation permission), and [2026-08-03-collection-activity-timeline-design.md](2026-08-03-collection-activity-timeline-design.md) (event listener when a receivable closes).

## 1. Entity

```
InternalTask
  id, organizationId, receivableId, assignedToUserId, createdByUserId (nullable — null = system),
  taskType (ESCALATION/MANUAL), title, description, dueDate (nullable),
  status (OPEN/DONE/DISMISSED),
  createdAt, resolvedAt
```

## 2. Escalation trigger (automatic)

Reuse the Reminder Automation daily cron — do not create a separate scheduled job, avoiding duplicate logic for scanning overdue receivables:

```
In the daily cron (see step 2 of section 3 in 2026-08-03-reminder-automation-design.md),
after processing the reminder rule for a receivable:
  Resolve escalationThresholdDays: the receivable's Customer.customerGroup selects a
     ReminderPolicy (organizationId + customerGroup); use that policy's
     escalationThresholdDays. If no active policy matches the customer's group,
     fall back to 30 days.
  If (today - dueDate) >= escalationThresholdDays
     AND no InternalTask(taskType=ESCALATION, status=OPEN) exists for this receivable
  → assignee := the organization's first FINANCE_MANAGER (by earliest membership);
     if the organization has none, fall back to its first OWNER
     (every organization has at least one OWNER; escalation must never silently
     go to no one)
  → create InternalTask(taskType=ESCALATION, assignedToUserId=assignee,
     title="Overdue receivable for {days} days requires action", createdByUserId=null)
```

`escalationThresholdDays` lives on `ReminderPolicy` (see `2026-08-03-reminder-automation-design.md` section 2) rather than on `InternalTask` or a new settings entity — it varies per `customerGroup`, the same axis `ReminderPolicy` already keys on, and reuses that entity's existing write path (`PATCH /reminder-policies/:id`, `Permission.REMINDER_POLICY_WRITE`) instead of introducing a new settings screen.

## 3. Read, manual creation & resolution

```
GET /receivables/:id/tasks
  → list of tasks for the receivable in the current tenant, newest first
  Permission: RECEIVABLE_READ
```

```
POST /receivables/:id/tasks
  body: { assignedToUserId?, title, description, dueDate? }
  taskType=MANUAL, createdByUserId=current user; if assignedToUserId is omitted,
  assign it to the current user by default.
  assignedToUserId (whether supplied or defaulted) MUST resolve to an existing
  Membership in the current organization — an unrecognized or cross-tenant userId
  is rejected (VALIDATION_ERROR), not silently accepted.
  Permission: FINANCE_MANAGER, ACCOUNTANT

POST /tasks/:id/resolve   → status=DONE, resolvedAt=now
POST /tasks/:id/dismiss   → status=DISMISSED, resolvedAt=now
  Only the task's assignedToUserId, or an OWNER, may resolve/dismiss it — an
  INTERNAL_TASK_MANAGE holder who is neither is rejected (FORBIDDEN), even though
  they can list and create tasks. OWNER overrides the assignee check the same way
  it overrides other assignment-scoped restrictions elsewhere in the app (e.g. an
  assignee who has left the org still has their tasks recoverable).
```

When `Receivable` transitions to a closed status (`PAID`/`WRITTEN_OFF`/`CANCELLED`), every remaining `OPEN` `InternalTask` for that receivable automatically transitions to `DISMISSED`. `PAID` and the other two terminal statuses are three separate call sites (`AllocatePaymentUseCase`, `WriteOffReceivableUseCase`, `CancelReceivableUseCase`); all three emit `receivable.status-closed`, a distinct event from `2026-08-03-collection-activity-timeline-design.md`'s narrower, PAID-only `receivable.closed` (see ADR-0005). This plan's listener subscribes only to `receivable.status-closed`.

## 4. Out of scope

- "Suggest temporarily suspending credit sales to the customer" (section 7.14 of the source document) — only a suggestion displayed in `InternalTask.description`; the MVP has no mechanism to automatically block new receivables for that customer.
- Real-time notifications (push/Slack) for new tasks — use the existing internal notification mechanism (section 7.5 of the MVP source document); do not add a separate channel.
- **In-app notification when an organization has no FINANCE_MANAGER.** The MVP falls back to assigning the OWNER instead (section 2) rather than surfacing a notification, because no in-app (bell-icon/read-tracking) notification system exists yet — `notifications/` today is email-only. Building one is a separate, cross-cutting ticket, not part of this plan.

## 5. Open questions (do not block implementation)

- Resolved for the MVP: `escalationThresholdDays` is configurable per `ReminderPolicy`/`customerGroup` (section 2), not a single organization-wide value.
- Resolved for the MVP: an `InternalTask` is resolvable/dismissible only by `assignedToUserId` or `OWNER` (section 3) — not by any `INTERNAL_TASK_MANAGE` holder.
