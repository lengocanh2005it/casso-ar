# 34. Serialize reminder delivery per receivable

Date: 2026-10-08

## Status

Accepted — confirmed by the user on 2026-10-08

## Decision

Enforce reminder minimum intervals in the email worker immediately before the provider call. The scheduler snapshots the matched rule's `minIntervalDays` on the reminder-send job; the value is persisted with the automated `ReminderExecution` and carried into the email job so policy edits do not change already queued work. All reminder email origins share a renewable Redis lock scoped by organization and receivable around the latest-`SENT` lookup, provider call, and outcome update. The fresh lookup spans all rules and includes manual/Copilot reminders. If the interval has not elapsed, update the current pending execution to `SKIPPED/RATE_LIMITED`; if the lock cannot be acquired, do not call the provider and let BullMQ retry.

## Rationale

The scheduler's scan-time read can be stale by the time a delayed job reaches the provider, and separate execution IDs do not serialize jobs for the same receivable. A database transaction cannot safely include the provider call, while an unlocked lookup leaves a check-then-send race. A renewable per-receivable Redis lock lets the worker make the decision against the latest successful send while preserving the queue-only provider boundary from ADR-0009.

For legacy queued work without a captured interval, resolve the original rule's value if it still exists. If the policy update removed that rule and its interval cannot be recovered, mark the execution `FAILED` with a configuration reason and do not send.
