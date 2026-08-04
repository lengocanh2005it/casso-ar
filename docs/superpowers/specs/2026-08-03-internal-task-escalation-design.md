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
  If (today - dueDate) >= escalationThresholdDays (e.g. 30 days)
     AND no InternalTask(taskType=ESCALATION, status=OPEN) exists for this receivable
  → create InternalTask(taskType=ESCALATION, assignedToUserId=the organization's Finance Manager,
     title="Overdue receivable for {days} days requires action", createdByUserId=null)
```

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
  assign it to the current user by default
  Permission: FINANCE_MANAGER, ACCOUNTANT

POST /tasks/:id/resolve   → status=DONE, resolvedAt=now
POST /tasks/:id/dismiss   → status=DISMISSED, resolvedAt=now
```

When `Receivable` transitions to a closed status (`PAID`/`WRITTEN_OFF`/`CANCELLED`), every remaining `OPEN` `InternalTask` for that receivable automatically transitions to `DISMISSED` — handled through the same domain event listener used in [2026-08-03-collection-activity-timeline-design.md](2026-08-03-collection-activity-timeline-design.md) (listen for `Receivable.status` changing to a closed status).

## 4. Out of scope

- "Suggest temporarily suspending credit sales to the customer" (section 7.14 of the source document) — only a suggestion displayed in `InternalTask.description`; the MVP has no mechanism to automatically block new receivables for that customer.
- Real-time notifications (push/Slack) for new tasks — use the existing internal notification mechanism (section 7.5 of the MVP source document); do not add a separate channel.

## 5. Open questions (do not block implementation)

- Is `escalationThresholdDays` configurable per `ReminderPolicy`/`customerGroup`, or is it one fixed value for the entire organization?
- Should an `InternalTask` be resolvable/dismissible only by `assignedToUserId` or `OWNER`, or can anyone who can view the task resolve it?
