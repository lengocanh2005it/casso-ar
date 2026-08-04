# 4. Split candidate scanning (cron) from actual sending (worker); the worker re-checks state

Date: 2026-08-03

## Status

Accepted

## Context

Reminder automation must scan overdue `Receivable` records daily and send payment-reminder emails. The simplest approach is for the cron to scan and send the email in one step. The problem is that between the start of the scan (which may take time when there are many receivables) and the actual send, a `Payment` may be recorded for that receivable — if sending relies on data read during the scan, a customer who has already paid still receives a reminder, creating a poor experience and damaging trust (this fintech product sends real emails to customers).

## Decision

Split into two separate steps:

1. **Cron scan** (scan step in `2026-08-03-reminder-automation.md`): select eligible reminder candidates and enqueue a "send reminder job" — **do not send email at this step**.
2. **Send reminder job** (separate worker, processing each job independently): reload the receivable from the DB (fresh read; do not use data from the cron scan). If the status has changed to `PAID`/`WRITTEN_OFF`/`CANCELLED`, or `isDisputed` is now `true` → record `ReminderExecution(status=SKIPPED, skipReason=...)`, stop, and do not send the email. Send only if the state is still valid at send time.

`ReminderExecution` always carries `organizationId` and `executionDate`; the receivable/rule/date idempotency key is checked before enqueueing. The worker creates a `PENDING` execution and delegates sending to `EmailService`/the email queue; the email worker itself updates `SENT` or `FAILED`.

## Consequences

- Eliminates the race condition between "scan" and "actual send" without locking the receivable for the entire cron run (which could be lengthy for large volumes).
- In return, the system needs a job queue and a separate worker instead of a simple cron job — adding an operational component (monitoring failed jobs, retries, and dead letters) compared with the one-step approach.
- There is a delay between being "selected as a candidate" and "actually sent" equal to the time the job spends in the queue — acceptable because the goal is correct content at send time, not immediate sending.
- `ReminderExecution.status = SKIPPED` (a business decision caused by payment/dispute) is clearly distinguished from `status = FAILED` (a technical sending error) — preserve this distinction when building reporting UI; do not combine them into one "could not send" type.
