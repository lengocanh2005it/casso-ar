# Issue #426: reminder enqueue recovery — design interview

Status: implemented on `fix/426-reminder-enqueue-recovery`; rounds 1–4 and test seams accepted.

Issue: https://github.com/lengocanh2005it/casso-ar/issues/426

## Observed behavior

- `ReminderSenderService.send()` returns for every existing execution, including `PENDING` (`apps/backend/src/modules/reminders/application/reminder-sender.service.ts`).
- The sender persists a `PENDING` execution before calling `EmailService.sendReminderEmail()`. An enqueue error propagates after the execution exists.
- The outer `reminder-send` job has three attempts with exponential backoff starting at five seconds (`reminder-scheduler.service.ts`). Its next attempt currently returns without scheduling delivery.
- The email job already uses the persisted execution ID as its `jobId` (`apps/backend/src/modules/notifications/application/email.service.ts`). Recovery must reuse the winning execution row and that identity.
- Repositories scope execution lookups by the tenant context. The reminder processor installs the job's organization context before invoking the sender.
- ADR-0004 distinguishes business skips (`SKIPPED`) from technical failures (`FAILED`); ADR-0009 requires queue-only email sending. The email worker currently checks execution status, but does not recheck receivable eligibility before calling the provider.
- The daily scheduler matches the current execution date and an exact due-date offset. It is not a sweep of old pending executions.
- Policy updates delete old rules and generate new rule IDs. Executions store neither the template ID nor a rendered payload, so recovery of a deleted rule needs an explicit policy.
- Copilot also creates pending executions, with a null rule ID, before enqueueing email. A repeated confirmation is refused; a rule-based recovery sweep cannot reconstruct those emails from the execution alone.
- SMTP fallback uses a second identity, `${executionId}-resend-fallback`, and can leave the original execution pending while that fallback is in progress. Recovery must account for both jobs.
- The current repository has a guarded pending-to-sent/failed update, but no pending-to-skipped transition. Revalidation must update the existing row rather than insert a new skipped execution with the same key.

Queue reference for later design: [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids) and [auto-removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs). Retained job identities deduplicate additions, including finished jobs; re-adding a retained failed job is not a restart. No queue retention overrides were found in the backend registrations.

## Issue requirements

- A retry of a pending execution whose email job was not accepted recovers delivery.
- Recovery preserves execution/job identity and does not create duplicate active email jobs.
- Transient enqueue failure followed by queue recovery reaches a terminal outcome rather than leaving an execution permanently pending without a job.
- Regression coverage exercises execution creation, enqueue failure, retry, and successful scheduling.

## Decision tree

1. Recovery scope (Q1, open): existing job retries only, or recovery after those retries are exhausted.
   - If durable recovery is included: choose its trigger, eligibility age, batch bounds, retry exhaustion semantics, and handling of historical pending executions.
   - Decide whether recovery covers automated reminders only or also Copilot; the latter needs additional delivery intent information.
2. Business eligibility (Q2, open): skip a pending reminder when payment, closure, or dispute makes it ineligible before recovery, or preserve its original send intent.
   - If revalidation is chosen: settle the validation boundary and races with accepted/active email jobs.
3. Email content (Q3, open): current data when the email job is created, or an execution-time snapshot.
   - Settle missing/deleted rules and templates, changed recipients, and already accepted payloads.
4. Queue identity and outcomes (awaiting factual investigation): concurrent recovery, ambiguous acceptance, completed/failed retained jobs, and SMTP fallback jobs.
5. Verification scope (after behavior is settled): failure/retry regression, real queue deduplication, terminal outcomes, and tenant isolation.

## Accepted decisions — Round 1

| Question | Recommendation | User decision |
| --- | --- | --- |
| Q1: recovery after all three outer attempts fail? | Include automatic recovery after retries are exhausted. | Accepted |
| Q2: receivable becomes paid, closed, or disputed before recovery? | Revalidate and record `SKIPPED` on the existing execution if ineligible. | Accepted; update the existing row |
| Q3: data changes before an email job is accepted? | Render current data when creating the job; preserve an already accepted job's payload. | Accepted |

## Accepted decisions — Round 2

| Question | Recommendation | User decision |
| --- | --- | --- |
| Q4: how should long-lived pending executions be found? | Sweep every minute for automated reminder executions still `PENDING` after a one-minute grace period. Reuse stable identity and skip executions whose original or SMTP fallback job is active. | Accepted |
| Q5: should the sweep recover Copilot-originated pending executions too? | No. Issue #426 covers rule-based automated reminders; Copilot executions lack a persisted template or message intent. | Accepted: automated reminders only |
| Q6: what if the original rule or template was deleted before recovery can render a job? | Mark the existing execution `FAILED` with a clear configuration reason; there is no longer enough information to produce the intended email safely. | Accepted |
| Q7: what if the original email job is retained as failed while SMTP fallback is missing or failed? | Treat original and fallback job states explicitly; retry delivery under a deterministic recovery identity, while keeping the execution `PENDING` until delivery succeeds or exhausts its defined retry path. | Accepted |

## Accepted decisions — Round 3

| Question | Recommendation | User decision |
| --- | --- | --- |
| Q8: when a deterministic email job still exists as `failed`, how should recovery restart it? | Retry that retained BullMQ job under its existing stable ID; skip waiting, delayed, or active jobs; recreate with the same ID only when the job is absent. | Accepted |
| Q9: how many pending executions should one organization recovery pass handle? | Cap each organization's pass at 100 oldest eligible executions; later minute passes drain larger backlogs. | Accepted |
| Q10: when the email worker exhausts its configured delivery attempts, should recovery send again forever? | No. Preserve terminal `FAILED` behavior after provider attempts and SMTP fallback exhaust; recovery is for enqueue gaps or interrupted delivery paths, not unlimited retries. | Accepted |

## Round 4

One interaction remains between retrying a retained failed job and making failure terminal: without a recovery bound, a once-per-minute sweep could repeatedly restart a job after its configured attempts have ended.

| Question | Recommendation | User decision |
| --- | --- | --- |
| Q11: how should a retained failed job be bounded across repeated minute sweeps? | Allow one recovery replay under its existing ID without resetting BullMQ's attempt count; if that replay also exhausts, keep the existing terminal `FAILED` outcome. | Accepted |
| Q12: should overlapping cron instances recover the same organization at once? | Allow overlap; a shared renewable per-execution Redis lock serializes sweep retry with final-failure handling, while BullMQ job IDs and fresh state checks preserve identity and handle worker races. Keep the existing per-organization tenant context. | Accepted |
| Q13: should the one-minute stale age use execution creation time or a mutable last-attempt timestamp? | Use `createdAt`; failed enqueue retries must not keep moving the execution out of the bounded stale scan, and the entity has no attempt timestamp today. | Accepted |

After the frontier is empty, present the complete design tree and ask the user to confirm shared understanding. Do not implement before that confirmation.

Update the glossary as accepted business terms crystallise. Record an ADR only after a consequential recovery architecture trade-off is settled. Implementation follows confirmation of shared understanding.

## Proposed shared understanding

1. Keep email sending asynchronous through BullMQ. Continue to persist one reminder execution before enqueueing its email, then use that existing execution's ID for the email job.
2. A sender retry must resume an existing `PENDING` automated execution instead of returning. If its original email job already exists, inspect both the original ID and `${executionId}-resend-fallback`: leave waiting, delayed, or active work alone; retry a retained failed job under its existing ID; add with the same ID only when absent.
3. Add a per-organization recovery sweep every minute. Under each organization's tenant context, process at most the 100 oldest automated executions still `PENDING` whose `createdAt` is at least one minute old. Overlapping instances are allowed; a renewable Redis lock keyed by email queue and execution ID serializes sweep recovery with the email worker's final-failure callback, which must re-read current job state and attempts before side effects.
4. Before creating a missing email job, recheck receivable eligibility. If it is paid, closed, or disputed, transition the existing execution to `SKIPPED`. If the original reminder rule or template is gone, transition that same execution to `FAILED` with a configuration reason. Render current customer, receivable, organization, and template data when constructing an email job that has not previously been accepted.
5. Recover rule-based automated reminders only. Copilot-originated executions are out of scope because they do not persist enough email intent to reconstruct delivery safely.
6. Give a retained failed job at most one recovery replay without resetting its BullMQ attempt count. Serialize concurrent recovery/final-failure callbacks with a per-execution Redis lock. Defer jobs with no `finishedOn` or a failure younger than one minute so the BullMQ event handler can enqueue SMTP fallback or finalize status. After the configured delivery/fallback path exhausts, the execution is terminal `FAILED`.
7. Add regression coverage for: initial enqueue failure after execution creation; retry or sweep scheduling the email with the same execution ID; avoiding duplicates for active/or fallback jobs; bounded failed-job replay; current eligibility/configuration outcomes; and tenant-scoped batched recovery.

## Approaches considered

1. **Only resume from the existing reminder-send job retry.** This fixes the immediate early-return because attempts have the execution ID, but cannot recover when all three outer attempts are exhausted or the daily scan has moved to a new date.
2. **Chosen: resume pending executions and add a bounded periodic sweep.** It uses the existing execution and BullMQ job IDs, covers both normal retries and queue outages longer than the outer retry window, and needs no new delivery-intent table. It adds a tenant-scoped query every minute, bounded at 100 rows per organization.
3. **Introduce a transactional outbox.** It gives a stronger database-to-queue delivery handoff, but requires a new persisted message model, migration, publisher/consumer lifecycle, and broader operational behavior than #426 needs.

### Accepted decision log

- Q1: recovery continues after the outer queue's three attempts are exhausted.
- Q2: recheck payment/closure/dispute state and mark the existing execution `SKIPPED` if ineligible.
- Q3: use current data when creating an email job; preserve already accepted job payloads.
- Q4: sweep every minute after a one-minute stale grace period.
- Q5: recover automated reminders only, not Copilot executions.
- Q6: deleted rule/template means `FAILED` with a configuration reason.
- Q7: inspect original and SMTP fallback job states.
- Q8: retry a retained failed job under its original deterministic ID; skip active/waiting/delayed jobs; use the ID again when missing.
- Q9: process at most 100 oldest pending executions per organization per sweep.
- Q10/Q11: preserve the configured retry limit, allow only one additional recovery replay for a retained failed job without resetting attempts, then finish as `FAILED`.
- Q12: permit overlapping instances with a shared renewable per-execution Redis lock, fresh queue-state checks, stable identities, and per-tenant context.
- Q13: calculate staleness from `createdAt`.

### TDD test seams confirmed

- `ReminderSenderService.send()` with public repository and email-service ports: retry an existing pending execution with the same execution ID, revalidate eligibility, and avoid work for terminal executions.
- `ReminderExecutionRecoveryService.recoverStalePending()` with organization repository, tenant context, execution repository, and sender: stale cutoff, per-organization batch cap, tenant scoping, and continuing across individual failures.
- `BullMqEmailQueue.recoverReminderDelivery()` with mocked BullMQ `Queue`/Redis contracts: original/fallback state detection, same-ID retry, bounded additional replay, and execution-lock serialization. The processor spec checks stale failed-event snapshots and that fallback enqueue precedes owner-warning work. No real Redis test container is needed for this issue.

## Implementation outcome

- PostgreSQL `date` columns can hydrate as `YYYY-MM-DD` strings through TypeORM. The stale-execution repository mapper normalizes them to UTC-midnight `Date` values before they reach the sender; a repository regression test covers the driver-shaped value.
- Existing `PENDING` executions now inspect both the primary email job and SMTP fallback before constructing another message. If no job exists, the sender revalidates the receivable and current rule/template, then reuses the same execution ID; terminal or active work is not duplicated.
- The one-minute recovery sweep uses `createdAt`, runs under each organization's owner tenant context, asks the repository for the 100 oldest automated pending rows, and isolates errors per execution and organization. Rows without a rule ID remain excluded.
- Queue recovery retries a retained failed fallback before the primary job, preserves each job ID and BullMQ attempt count, and allows one recovery replay under the shared lock. It defers recent failures for the worker's asynchronous fallback/finalization callback; stale failed-event snapshots cannot make side effects after the job has moved. SMTP fallback enqueue runs before owner warning work and lock release.
- The renewable Redis lock is namespaced through the existing BullMQ queue backend and is shared by sweep retry and the worker's final-failure callback. Recovery acquisition is non-blocking; the callback may wait up to 30 seconds. Lease release/renewal compares the lock token, and a failed callback lock acquisition leaves the pending row for the next sweep.
- Deleted rules/templates and changed receivable eligibility update the existing pending execution to `FAILED` or `SKIPPED`; no replacement execution row is created.
- Final validation on 2026-10-08: adapter and processor focused specs passed 30/30; sender and EmailService specs passed 17/17; recovery-service spec passed 5/5; the complete backend suite passed 397 suites and 1695 tests; backend type-check and `pnpm verify` passed. The final review refinements include regression coverage for PostgreSQL date hydration, lock contention, stale failure events, and the asynchronous SMTP fallback race.
- Operational note: a job lacking `finishedOn` is deferred safely and remains eligible for the next minute sweep. A known failed timestamp can add at most a one-minute grace for its asynchronous failure handler. If a lock lease is lost while the final-failure callback is running, the callback reports that outcome for logging and leaves reconciliation to the next sweep.
