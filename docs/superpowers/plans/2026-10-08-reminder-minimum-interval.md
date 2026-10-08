# Reminder Minimum Interval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce each automated reminder's captured minimum interval immediately before provider delivery, while serializing every reminder email for the same receivable.

**Architecture:** Capture `minIntervalDays` when the scheduler enqueues a reminder, persist it on the execution, and carry it through recovery and email jobs. The email worker acquires a tenant and receivable scoped renewable Redis lock, reloads the current execution and latest successful send, and then either records `SKIPPED/RATE_LIMITED` or sends and records `SENT` while holding the lock.

**Tech Stack:** NestJS, TypeScript, TypeORM/PostgreSQL, BullMQ/Redis, Jest, testcontainers.

## Global Constraints

- `minIntervalDays` means exactly `minIntervalDays × 24 hours`; delivery at the threshold is allowed.
- The latest `SENT` execution for a receivable counts across all rules and origins, including executions with no rule; other statuses do not count.
- The interval is captured when the scheduler queues a reminder and remains attached to that execution after policy edits.
- Every reminder email origin shares a lock scoped by organization and receivable; only automated jobs with a known interval are rate-limited.
- A missing or unavailable lock prevents provider delivery and leaves the queue attempt retryable; lock contention is not `RATE_LIMITED`.
- A legacy automated job may recover its interval from the original rule; if unavailable, mark the execution `FAILED` with a clear configuration reason.
- Preserve clean architecture, tenant-scoped persistence, explicit ORM mapping, and the repository's required TDD workflow.

---

## File Map

- `apps/backend/src/modules/reminders/domain/reminder-execution.ts`: immutable persisted interval field on the execution model.
- `apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts` and `typeorm-reminder-execution.repository.ts`: nullable column, explicit persistence mapping, and recovery selection.
- `apps/backend/src/database/migrations/20261008020000-add-reminder-execution-min-interval.ts`: nullable column and tenant-scoped backfill from a still-existing rule.
- `apps/backend/src/modules/reminders/application/reminder-scheduler.service.ts`: exact elapsed-time precheck and job snapshot.
- `apps/backend/src/modules/reminders/application/reminder-sender.service.ts`: persist and carry the captured value through new and recovered executions.
- `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts`: explicitly initialize manual execution snapshots to `null`.
- `apps/backend/src/modules/reminders/application/i-email-service.port.ts`, `apps/backend/src/modules/notifications/application/email-queue.port.ts`, `email.service.ts`, and `email-queue.processor.ts`: optional legacy-compatible email payload and provider-boundary guard.
- `apps/backend/src/modules/notifications/infrastructure/email-queue.adapter.ts`: tenant/receivable scoped delivery lock, keeping existing execution-scoped recovery locking intact.
- Neighboring `*.spec.ts` files plus `apps/backend/test/reminder-automation.e2e-spec.ts`: public-seam unit and queue integration coverage.

## Task 1: Capture and persist the interval

**Interfaces:** `ReminderSendJob.minIntervalDays: number` is added as a required scheduler output, but accepted as optional at the sender boundary for legacy BullMQ payloads. `ReminderExecution.minIntervalDays: number | null` stores the captured value; `SendReminderEmailInput` and `ReminderEmailJob` carry it optionally so already queued legacy email jobs remain readable.

**Files:**
- Modify `apps/backend/src/modules/reminders/domain/reminder-execution.ts`
- Modify `apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts`
- Modify `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts`
- Create `apps/backend/src/database/migrations/20261008020000-add-reminder-execution-min-interval.ts`
- Modify `apps/backend/src/modules/reminders/application/reminder-scheduler.service.ts` and `.spec.ts`
- Modify `apps/backend/src/modules/reminders/application/reminder-sender.service.ts` and `.spec.ts`
- Modify `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts` and its spec if execution shape assertions require it
- Modify `apps/backend/src/modules/reminders/application/i-email-service.port.ts`
- Modify `apps/backend/src/modules/notifications/application/email-queue.port.ts`, `email.service.ts`, and relevant `.spec.ts`
- Modify `apps/backend/test/reminder-automation.e2e-spec.ts` only if needed to assert persisted snapshot behavior.

- [x] **Step 1: Add failing scheduler tests.** Assert that a reminder job contains the matched rule's `minIntervalDays`, that one millisecond before the exact threshold is recorded `RATE_LIMITED`, and that exactly at the threshold is queued.
- [x] **Step 2: Run the focused scheduler spec.** Run `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reminders/application/reminder-scheduler.service.spec.ts`; confirm the new assertions fail against current rounded-day behavior and missing payload field.
- [x] **Step 3: Add failing sender and email queue tests.** Assert the captured value is persisted on the pending execution, recovered pending executions reuse the persisted value, and `EmailService` places it in the email job data.
- [x] **Step 4: Run the focused sender and email service specs.** Run each spec with the same backend Jest command and confirm failures are due to absent snapshot propagation.
- [x] **Step 5: Implement snapshot propagation and exact scheduler comparison.** Add `minIntervalDays` to the domain and ORM mapping; use elapsed milliseconds against `minIntervalDays * 24 * 60 * 60 * 1000`; populate the queue payload; save it in new executions; pass the persisted value through both first enqueue and recovery.
- [x] **Step 6: Add the migration test and migration.** Add a test that the nullable integer column is created and execution rows are backfilled only from a rule joined through its policy's same `organizationId`; rows with deleted rules remain null. Implement `up`/`down` using the repository's migration conventions.
- [x] **Step 7: Run the task specs and migration spec.** Re-run all focused specs from this task and confirm they pass.

## Task 2: Add a shared receivable delivery lock

**Interfaces:** Add `IEmailQueue.runWithReceivableDeliveryLock(organizationId, receivableId, operation, waitForLockMs?)`, returning the existing `ReminderDeliveryLockResult<T>`. Construct the Redis lock key from both IDs. Keep `runWithReminderDeliveryLock(executionId, ...)` for recovery and terminal-failure processing.

**Files:**
- Modify `apps/backend/src/modules/notifications/application/email-queue.port.ts`
- Modify `apps/backend/src/modules/notifications/infrastructure/email-queue.adapter.ts` and `.spec.ts`
- Modify queue test doubles in `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts` and any compile-affected tests.

- [x] **Step 1: Add failing adapter tests.** Assert overlapping locks for the same organization/receivable serialize, two organizations produce independent locks for the same receivable ID, and a zero-wait lock conflict returns `{ acquired: false }` without running the operation.
- [x] **Step 2: Run the focused adapter spec.** Run `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/notifications/infrastructure/email-queue.adapter.spec.ts`; confirm the new method is absent.
- [x] **Step 3: Implement the lock method.** Reuse the adapter's renewable-token lock machinery with the resource key `reminder-receivable-delivery-lock:<organizationId>:<receivableId>` and bounded polling for an explicitly requested wait budget.
- [x] **Step 4: Run the adapter spec.** Confirm the new contention and tenant-isolation tests pass and existing recovery-lock tests remain green.

## Task 3: Enforce the interval at provider delivery

**Interfaces:** Inside the receivable lock, the processor loads the current execution via `findById` and verifies it is still `PENDING`. It uses the persisted interval snapshot, falling back to an interval present on a legacy-compatible email payload. It then calls `findLatestSentByReceivableIds([receivableId])`. A null snapshot on an automated execution means configuration is unrecoverable and is recorded as `FAILED`; manual executions with `reminderRuleId === null` have no gate but still use the lock.

**Files:**
- Modify `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts` and `.spec.ts`
- Modify `apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts` only if the current public repository methods cannot express the worker needs.
- Modify reminder rule repository DI/module wiring only if needed for legacy interval recovery.
- Modify `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts` and its spec if persisted snapshot mapping or query selection needs coverage.

- [x] **Step 1: Add failing processor tests.** Cover delayed execution suppressed by a newer `SENT`, exact threshold allowed, manual `SENT` history included, a legacy email job using the execution's persisted snapshot, unrecoverable automated interval marked `FAILED`, and current execution status rechecked after lock acquisition.
- [x] **Step 2: Add failing lock-contention test.** Make the receivable lock return `acquired: false`; assert `process()` rejects for BullMQ retry and the provider is never called or execution marked `RATE_LIMITED`.
- [x] **Step 3: Run the focused processor spec.** Run `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/notifications/infrastructure/email-queue.processor.spec.ts`; confirm failures represent absent gating and the new lock call.
- [x] **Step 4: Implement the gated send path.** Acquire the lock before the fresh history lookup; include latest `SENT` from any rule/origin; compare exact milliseconds; conditionally skip only the existing pending execution; keep provider call and `SENT` transition inside the lock. Any lock acquisition failure throws so BullMQ retries.
- [x] **Step 5: Run the focused processor and repository specs.** Confirm all new boundary, legacy, manual, lock-failure, tenant-scope, and existing SMTP fallback tests pass.

## Task 4: Verify delayed and concurrent queue delivery end to end

**Interfaces:** Exercise `EmailQueueProcessor.process()` through the existing real Postgres/Redis test app and its queue/provider public boundaries. Two jobs with different execution IDs but the same organization and receivable must observe one another's successful send.

**Files:**
- Modify `apps/backend/test/reminder-automation.e2e-spec.ts`
- Modify relevant setup in `apps/backend/test/` only if a queue/provider synchronization helper is needed.

- [x] **Step 1: Add the delayed-job integration test.** Create an automated execution behind a manual `SENT` execution; assert the delayed delivery becomes `SKIPPED/RATE_LIMITED` without a provider call.
- [x] **Step 2: Add the concurrency integration test.** Hold the fake provider for the first email, start a second execution for the same receivable under a different rule and date, then release the first; assert one provider send and a `SKIPPED/RATE_LIMITED` second execution.
- [x] **Step 3: Run the focused e2e spec.** Run `pnpm --filter @casso-ar/backend exec jest --config ./test/jest-e2e.json --runInBand test/reminder-automation.e2e-spec.ts`; confirm the persisted outcomes and Redis serialization work in the real test app.
- [x] **Step 4: Make integration seams deterministic and run green.** Use a deferred provider promise and an explicit lock-request signal to control provider order; assert persisted execution outcomes and provider call count.
- [x] **Step 5: Run required verification.** Run the focused backend unit specs, the backend reminder e2e spec, the repository's documented domain-check checklist, and `pnpm verify`; inspect every exit code and output before reporting. Fresh `TURBO_FORCE=true pnpm verify` passed (all lint, type-check, arch-check, and test tasks; backend 400 suites / 1,715 tests). Fresh `pnpm --filter @casso-ar/backend exec jest --config ./test/jest-e2e.json --runInBand test/reminder-automation.e2e-spec.ts` passed (14/14). The domain-check checklist found no prohibited production casts/numeric patterns or NestJS/TypeORM imports in domain files; tenant scope, transactional status updates, and the tenant-scoped migration backfill were inspected.

## Review Focus

- Check that the lock key includes organization and receivable and that the provider call plus successful status update stay inside the lock.
- Check strict threshold semantics (`elapsedMs < intervalMs` suppresses; equality sends) in both scheduler and worker.
- Check every persistence path and recovery payload keeps the captured value, including nullable legacy rows.
- Check manual/Copilot jobs share serialization and count as history without receiving an interval gate.
- Check lock failure throws without provider side effects and is never recorded as `RATE_LIMITED`.
- Check tenant scoping in repository reads, migration backfill, and lock key construction.
