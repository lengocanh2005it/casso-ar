# Issue #427: enforce reminder intervals at delivery

Status: accepted; confirmed by the user on 2026-10-08

Issue: https://github.com/lengocanh2005it/casso-ar/issues/427

## Current behavior

- The daily scheduler checks the latest `SENT` execution at scan time. It rounds elapsed milliseconds to days, applies the currently matched rule's `minIntervalDays`, and records an early suppression as `SKIPPED/RATE_LIMITED`.
- The scheduler queues reminder-send jobs with receivable, rule, and execution date, but not the interval value. The sender creates a `PENDING` execution and queues a separate email job.
- The email worker checks only that its execution remains `PENDING`, calls the email provider, and records `SENT`. Delayed or concurrently processed jobs do not recheck the interval.
- The lookup for latest `SENT` already spans rules and includes Copilot executions with no rule. Updating a policy replaces its rule IDs. Reminder executions are unique per receivable, rule, and execution date, so separate dates or rules can proceed concurrently.
- Reminder delivery locks currently serialize recovery by execution ID, not normal provider sends by receivable.

## Decision tree and accepted answers

| Decision | Accepted answer |
| --- | --- |
| Where to enforce the interval? | In the email worker immediately before the provider call, where delayed and concurrent deliveries can be gated. |
| How to interpret `minIntervalDays`? | As exact elapsed time: `minIntervalDays × 24 hours` after the prior `SENT` time. At the exact threshold, sending is allowed. |
| Which prior executions count? | The latest `SENT` for the same receivable across all rules and origins, including manual/Copilot executions. `PENDING`, `FAILED`, and `SKIPPED` do not count. Use the interval of the automated job's matched rule. |
| What if policy changes while the job waits? | Capture the interval when the scheduler queues the reminder-send job. That value follows the execution and email job; edits affect later jobs only. |
| How to serialize concurrent delivery? | Use one renewable Redis lock scoped by organization and receivable across the fresh `SENT` lookup, provider call, and outcome update. All reminder email origins use it; only automated jobs with a configured interval can be rate-limited. |
| How to record a suppressed delivery? | Update its existing `PENDING` execution to `SKIPPED/RATE_LIMITED`, preserving visible history and the existing execution identity. Lock contention alone is not a suppression. |
| What if a legacy job has no interval snapshot? | Resolve the original rule's interval if that rule still exists. If the original interval cannot be recovered, record `FAILED` with a clear configuration reason and do not send. |
| What if Redis cannot provide the lock? | Fail closed: do not call the provider; let BullMQ retry. Do not label lock contention `RATE_LIMITED`. |

## Proposed behavior

1. Keep the scheduler's early check and change its time comparison to exact elapsed duration. Include the matched rule's `minIntervalDays` in the reminder-send job. Persist that value on the resulting automated reminder execution and carry it into the email job, so delivery recovery and delayed email jobs retain the original configuration after a policy edit.
2. At provider delivery, acquire the organization/receivable lock. Under the job's tenant context, reload the latest `SENT` execution for that receivable across all rules, including executions with a null rule ID. Compare the exact elapsed time against the job's interval snapshot.
3. If the interval has not elapsed, conditionally change the current execution from `PENDING` to `SKIPPED` with `RATE_LIMITED`, then return without calling the provider. At or past the threshold, call the provider and update the execution to `SENT` before releasing the lock.
4. All reminder emails, including manual/Copilot sends and SMTP fallback deliveries, use the same per-receivable provider lock. They count as prior `SENT` executions; only automated jobs carry an interval to enforce.
5. A missing lock acquisition is retryable and has no provider side effect. After retry exhaustion, retain the existing terminal failure/recovery behavior. A legacy job without a snapshot uses its referenced rule if available; when that configuration has been deleted, record `FAILED` rather than send without a known interval.

## Acceptance and test coverage

- A delayed job rechecks a successful send that occurred after its scheduler scan and is recorded `SKIPPED/RATE_LIMITED` when inside its interval.
- Jobs from different execution dates and reminder rules share the same receivable history; each automated job uses its own captured rule interval.
- Manual/Copilot `SENT` executions count. `PENDING`, `FAILED`, and `SKIPPED` executions do not. An interval of zero does not suppress.
- The exact elapsed-time boundary is tested, including the transition from one millisecond before to the threshold.
- Concurrent reminder email jobs for the same receivable serialize; the second reads the first outcome and cannot send inside the interval. A lock failure makes no provider call and remains retryable.
- Suppression changes the existing execution and stays visible in reminder history. Missing legacy configuration fails with a clear reason and does not call the provider.
- Tests retain tenant scoping and cover reminders from different organizations without sharing a lock or history.

## Architecture decision

Proposed ADR: [0034 — serialize reminder delivery per receivable](../../adr/0034-serialize-reminder-delivery-per-receivable.md). It records why the provider check and send use a renewable Redis lock rather than an unlocked read or a database transaction around the external API.

The user confirmed this shared understanding on 2026-10-08. Implementation can proceed from this design.
