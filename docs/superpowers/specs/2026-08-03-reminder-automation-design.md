# Reminder Automation Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (uses `Receivable.status`, `Receivable.isDisputed`, `Receivable.dueDate`). Defines payment-reminder policy configuration, daily scanning, and how to avoid sending an incorrect reminder when a receivable has just been paid.

## 1. Scope

Reminder policy in this spec uses only two conditions: **customer group** (`customerGroup`: VIP | REGULAR) and **the number of days from `dueDate`**. It does not include risk scoring, advanced dispute status (only the existing `isDisputed` flag), or custom groups.

Out of scope: detailed Email Template Management (template content/variables — described in section 7.6 of the source document), and non-email notification channels (Zalo/SMS — future extension).

## 2. Entities

```
ReminderPolicy
  id, organizationId, customerGroup (VIP/REGULAR), isActive, createdAt

ReminderRule
  id, reminderPolicyId, offsetDays (negative = before dueDate, positive = after dueDate),
  emailTemplateId, minIntervalDays (minimum rate limit between 2 sends for the same receivable/customer),
  createdAt

ReminderExecution
  id, organizationId, receivableId, reminderRuleId (nullable for manual/ad-hoc send),
  executionDate, sentAt,
  status (PENDING/SENT/FAILED/SKIPPED), skipReason (ALREADY_PAID/DISPUTED/RATE_LIMITED),
  providerMessageId, failureReason, createdAt
```

`organizationId` is required under shared-schema tenancy. `executionDate` is the run date used for idempotency by `(receivableId, reminderRuleId, executionDate)`. `PENDING` is a technical state from execution creation and email enqueue until the email worker returns a result; only `SENT` counts toward the rate limit. Template binding is on `ReminderRule.emailTemplateId`, not on `ReminderPolicy`.

`Customer.customerGroup` (VIP | REGULAR) is added to Domain Core (the `Customer` entity in the Domain Core spec) as the condition for selecting a `ReminderPolicy`.

## 3. Scheduling flow

Do not pre-create the entire future schedule when a receivable is created — the daily cron computes matching rules at scan time, which is simpler and automatically adapts when `dueDate` changes (an extension) without cancellation/rescheduling logic.

```
1. Daily cron (BullMQ repeatable job) scans Receivable WHERE status IN (OPEN, PARTIALLY_PAID)
2. For each receivable:
   a. Skip if isDisputed = true
   b. Determine the Customer's customerGroup → corresponding ReminderPolicy (by organizationId + customerGroup)
   c. Calculate offsetDays = (dueDate - today), then find the policy's ReminderRule matching offsetDays
   d. If a rule matches: query the receivable's latest ReminderExecution within minIntervalDays —
      if a send (status=SENT) already exists in that period → skip and record ReminderExecution(status=SKIPPED, skipReason=RATE_LIMITED)
   e. If it passes the rate-limit check → enqueue a "send reminder job" (do not send email at this step)
3. Send reminder job (separate worker, process each job independently):
   a. Reload the receivable from the DB (fresh read; do not use data from the cron scan)
   b. If status has changed to PAID/WRITTEN_OFF/CANCELLED, or isDisputed has become true
      → record ReminderExecution(status=SKIPPED, with the corresponding ALREADY_PAID/DISPUTED skipReason), stop, and do not send email
   c. Otherwise: check the idempotency key; if the corresponding execution already exists, no-op. If not, create ReminderExecution(status=PENDING) and hand it to EmailService/email queue.
      The email worker renders/sends the email and updates the same row to SENT (with sentAt/providerMessageId),
      while emitting `reminder.sent`, or to FAILED (with failureReason), while emitting `reminder.failed`.
```

Separate step 2 (cron selects candidates and enqueues) from step 3 (worker actually sends and re-checks state) to handle the race condition: a payment may arrive between the cron scan and the actual email send — the worker always confirms the latest state immediately before sending, avoiding reminders to customers who have already paid.

**Timezone:** "today" and `executionDate` are always calculated by calendar date (`YYYY-MM-DD`), not by UTC/millisecond timestamps. Fix one shared `REMINDER_TIMEZONE` (default `Asia/Ho_Chi_Minh`) for all organizations in the MVP — there is no per-organization `Organization.timezone` field (out of scope; all MVP customers use Vietnam time). The BullMQ repeatable job also uses this timezone when registered (`0 1 * * *`, tz `Asia/Ho_Chi_Minh`) rather than the server's default time.

## 4. Out of scope

- Email Template content/variables — section 7.6 of the source document.
- Non-email notification channels (Zalo OA, SMS, Teams, Slack).
- Escalation to managers/department heads for long-overdue receivables (Internal Task/Escalation — separate spec/plan).
  Reminder Automation must not import, initialize, or call escalation participants when that area is outside the implementation scope.

## 5. Open questions (do not block implementation)

- Is `minIntervalDays` configurable per `ReminderRule`, or fixed at one shared value for the entire `ReminderPolicy`?
- When the Owner changes a Customer's `customerGroup` midway (VIP → REGULAR), should historical `ReminderExecution` records be relabeled under the old policy for reporting, or should it affect only future scans?
