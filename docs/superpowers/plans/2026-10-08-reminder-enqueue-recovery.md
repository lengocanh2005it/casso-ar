# Reminder Delivery Recovery Implementation Plan

> **For agentic workers:** Use inline execution task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover rule-based reminder executions left `PENDING` after email enqueue failure, retaining one execution and deterministic BullMQ job identities.

**Architecture:** `ReminderSenderService` resumes an existing pending execution after checking email queue state, revalidates the receivable and rule, and reuses the execution ID. A one-minute per-organization recovery service calls that same public sender seam for at most 100 stale executions; TypeORM scopes the scan by the current tenant, and `BullMqEmailQueue` serializes recovery with final-failure handling under a renewable per-execution Redis lock before inspecting or retrying original/fallback jobs.

**Tech Stack:** NestJS 11, TypeORM 1.1, BullMQ 6.0.8, PostgreSQL, Jest 30, pnpm 11.20.0.

## Global Constraints

- `presentation → application → domain`, `infrastructure → application`; application ports do not import BullMQ or TypeORM concrete classes.
- Every execution query and write is scoped by `organizationId` from `TenantContextService`.
- Every status transition is transactional and conditional on the execution still being `PENDING`.
- Existing job IDs are reused: `<executionId>` for the reminder and `<executionId>-resend-fallback` for SMTP fallback.
- The recovery cron runs once per minute, waits one minute after `createdAt`, and handles at most 100 oldest rule-based executions per organization.
- Copilot executions (`reminderRuleId = null`) remain outside this recovery path.
- The shared execution lock serializes the recovery sweep with the email worker's final-failure callback; the callback confirms the BullMQ job is still failed at the observed attempt count before changing execution/config state or adding SMTP fallback.
- A failed job younger than one minute or without a `finishedOn` value is left alone so its asynchronous final-failure callback can enqueue SMTP fallback or mark the execution terminal before recovery.
- No production `any`, no provider calls from the application layer, and no new dependency.
- No money fields or public API DTOs change.
- Use TDD at the agreed public seams: `ReminderSenderService.send()`, `ReminderExecutionRecoveryService.recoverStalePending()`, and `BullMqEmailQueue` through a mocked Queue/Redis contract; verify the worker's final-failure callback joins the same lock.
- Run focused Jest tests for each slice, then `pnpm verify` and the backend `domain-check` skill before reporting completion.

---

### Task 1: Persist tenant-scoped stale execution selection and guarded outcomes

**Files:**
- Modify: `apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts`
- Modify: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts`
- Modify: `apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts`
- Test: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts`
- Create: `apps/backend/src/database/migrations/20261008010000-add-reminder-execution-recovery-index.ts`
- Test: `apps/backend/src/database/migrations/20261008010000-add-reminder-execution-recovery-index.spec.ts`

**Interfaces:**
- Add `findPendingAutomatedBefore(createdBefore: Date, limit: number): Promise<ReminderExecution[]>`; it selects by current tenant, `PENDING`, non-null rule ID, oldest `createdAt` first, with the caller's limit.
- Add `markSkippedIfPending(id: string, skipReason: ReminderSkipReason): Promise<void>`.
- Extend `updateSendResult(id, status, providerMessageId, failureReason?)`; a failure reason supplied by recovery is persisted, while existing callers retain the current default.
- Add a partial composite index on `(organizationId, createdAt)` where status is `PENDING` and `reminderRuleId IS NOT NULL`.

- [x] **Step 1: Write the failing repository tests**

Test that stale selection filters by tenant/status/non-null rule, orders oldest first, and applies the exact limit. Test the guarded skip update and the custom failure reason, including their `PENDING` predicate and organization scope. Add a migration test for index creation and rollback.

- [x] **Step 2: Run repository and migration tests; confirm expected failures**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts src/database/migrations/20261008010000-add-reminder-execution-recovery-index.spec.ts`

Expected: the new repository methods and migration class are absent, so the targeted cases fail.

- [x] **Step 3: Implement the port, transactional scoped queries, entity index, and reversible migration**

Use `TenantContextService.getOrganizationId()` in each repository method. Select only the columns needed to rebuild `SendReminderJob`; update only rows whose status remains `PENDING`; preserve transaction boundaries. The recovery query shape is:

```ts
where('e."organizationId" = :organizationId', { organizationId })
  .andWhere('e.status = :pending', { pending: ReminderExecutionStatus.PENDING })
  .andWhere('e."reminderRuleId" IS NOT NULL')
  .andWhere('e."createdAt" <= :createdBefore', { createdBefore })
  .orderBy('e."createdAt"', 'ASC')
  .take(limit)
```

Keep the entity metadata and migration aligned with this partial index:

```sql
CREATE INDEX IF NOT EXISTS "IDX_reminder_executions_pending_recovery"
ON "reminder_executions" ("organizationId", "createdAt")
WHERE "status" = 'PENDING' AND "reminderRuleId" IS NOT NULL
```

- [x] **Step 4: Rerun the focused tests**

Run the same Jest command. Expected: all repository and migration tests pass.

### Task 2: Recover existing email jobs through the queue port

**Files:**
- Modify: `apps/backend/src/modules/notifications/application/email-queue.port.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.adapter.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`
- Create: `apps/backend/src/modules/notifications/infrastructure/email-queue.adapter.spec.ts`

**Interfaces:**
- Add `ReminderDeliveryRecoveryResult = 'MISSING' | 'IN_FLIGHT' | 'RETRIED' | 'COMPLETED' | 'EXHAUSTED'`.
- Add `IEmailQueue.recoverReminderDelivery(executionId: string): Promise<ReminderDeliveryRecoveryResult>`.
- Add a renewable Redis lock keyed by queue + execution ID. Recovery does not wait for it; the final-failure callback may wait up to 30 seconds and must re-read the current job state and attempt count while holding the lock.
- Inspect `<executionId>` and `<executionId>-resend-fallback`. Existing waiting/delayed/active work returns `IN_FLIGHT`; completed work returns `COMPLETED`; absent jobs return `MISSING`.
- Prefer a failed fallback over a failed original job. Retry a retained failed job only when its configured attempts are exhausted exactly; do not reset `attemptsMade`. A later exhausted state returns `EXHAUSTED`. Handle a concurrent state change by re-reading the job state.
- Defer retry or terminal handling when a failed job has no `finishedOn` value or failed less than 60 seconds ago; BullMQ exposes `failed` before its asynchronous event handler finishes adding SMTP fallback or finalizing the execution.

- [x] **Step 1: Write the failing Queue-contract tests**

Cover both IDs absent; either job waiting/delayed/active; completed job; failed fallback priority; failed original; recent failed-job grace; one replay with no attempt reset; replay already consumed; overlapping recovery calls under one execution lock; stale failed-event snapshots; and a concurrent retry state change.

- [x] **Step 2: Run the adapter spec and confirm the missing-port failures**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/notifications/infrastructure/email-queue.adapter.spec.ts`

Expected: the adapter recovery operation and its Queue-state branches are not implemented.

- [x] **Step 3: Implement recovery with the pinned BullMQ Queue API**

Use the shared BullMQ Redis client for a token-checked renewable lock with bounded failure-handler waiting. Under the lock, use `getJob`, each job's `getState`, `attemptsMade`, `opts.attempts`, and `job.retry('failed')`. Preserve original/fallback payloads and IDs. The bounded retry branch is:

```ts
if (state === 'failed') {
  if (job.attemptsMade !== job.opts.attempts) return 'EXHAUSTED';
  try {
    await job.retry('failed');
    return 'RETRIED';
  } catch (error) {
    const nextState = await job.getState();
    if (nextState === 'waiting' || nextState === 'delayed' || nextState === 'active') {
      return 'IN_FLIGHT';
    }
    if (nextState === 'completed') return 'COMPLETED';
    if (nextState === 'failed') return 'EXHAUSTED';
    throw error;
  }
}
```

Return a typed outcome rather than throwing when another worker wins a state race; let Redis/transport errors propagate so the caller can retry later.

- [x] **Step 4: Rerun the adapter spec**

Run the same Jest command. Expected: all job-state and bounded-retry cases pass.

### Task 3: Resume existing `PENDING` executions in the sender

**Files:**
- Modify: `apps/backend/src/modules/reminders/application/i-email-service.port.ts`
- Modify: `apps/backend/src/modules/reminders/application/reminder-sender.service.ts`
- Modify: `apps/backend/src/modules/reminders/application/reminder-sender.service.spec.ts`
- Modify: `apps/backend/src/modules/notifications/application/email.service.ts`
- Modify: `apps/backend/src/modules/notifications/application/email.service.spec.ts`

**Interfaces:**
- Add `IEmailService.recoverReminderDelivery(executionId: string): Promise<ReminderDeliveryRecoveryResult>` delegating to `IEmailQueue`.
- `ReminderSenderService.send()` returns immediately for existing terminal executions. For an existing pending row, it inspects original/fallback jobs first. It resumes current-data rendering only when both jobs are absent; it marks the same row `FAILED` for completed/exhausted jobs and marks the same row `SKIPPED` if receivable eligibility changed.
- The send path reuses the existing execution UUID as `reminderExecutionId`; a deleted rule/template moves that row to `FAILED` with an explicit reason.
- If a concurrent sender loses `insertIfAbsent`, it re-reads the winning execution and applies the same `PENDING` recovery path.

- [x] **Step 1: Write the sender regression tests**

Replace the old test that expects every existing execution to stop. Add cases for enqueue failure after creating `PENDING`, retry reusing the existing ID, no duplicate work for in-flight/completed/failed jobs, same-row `SKIPPED` for paid/disputed receivables, same-row `FAILED` for missing configuration, terminal status no-op, and a concurrent insert winner.

- [x] **Step 2: Run the sender spec and confirm the regression failure**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reminders/application/reminder-sender.service.spec.ts`

Expected: the current implementation returns early for existing `PENDING` and fails the retry/revalidation assertions.

- [x] **Step 3: Add email recovery delegation and update sender flow**

Keep BullMQ details behind `IEmailService`/`IEmailQueue`. The sender flow for an existing row is:

```ts
if (existing.status !== ReminderExecutionStatus.PENDING) return;
const outcome = await emailService.recoverReminderDelivery(existing.id);
if (outcome !== 'MISSING') {
  if (outcome === 'COMPLETED' || outcome === 'EXHAUSTED') {
    await executionRepo.updateSendResult(existing.id, 'FAILED', null, failureReason);
  }
  return;
}
// Re-read receivable and rule; mark the existing row skipped/failed if invalid.
// Otherwise render current data and enqueue with existing.id.
```

Revalidate the current candidate only when no email job exists or a new job must be constructed. Change terminal status with the scoped repository methods and keep queue errors retryable.

- [x] **Step 4: Add the email-service delegation test and rerun both focused specs**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reminders/application/reminder-sender.service.spec.ts src/modules/notifications/application/email.service.spec.ts`

Expected: sender and queue-port integration behavior passes with the same execution identity.

### Task 4: Add the tenant-scoped minute recovery sweep

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-execution-recovery.service.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-execution-recovery.service.spec.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`

**Interfaces:**
- Add `ReminderExecutionRecoveryService.recoverStalePending(now = new Date()): Promise<void>` and cron `*/1 * * * *`.
- Read organization IDs, enter the existing system-owner tenant context per organization, select the 100 oldest automated pending rows with `createdAt <= now - one minute`, and call the public sender seam using the persisted rule/receivable/date.
- Catch each execution failure, log its organization/execution context, and continue to later rows. Catch an organization failure and continue to the next organization.

- [x] **Step 1: Write failing recovery-service tests**

Cover the one-minute cutoff, a maximum of 100 oldest rows per organization, `reminderRuleId = null` excluded by the repository contract, tenant context for each organization, continuing after one failed sender call, and organization-level failure isolation.

- [x] **Step 2: Run the new recovery-service spec and confirm expected failures**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reminders/application/reminder-execution-recovery.service.spec.ts`

Expected: the recovery service and cron wiring are absent.

- [x] **Step 3: Implement the minute sweep and register its provider**

Use the injected repository and organization ports; do not query TypeORM or BullMQ from the application service. Use the existing `Role.OWNER` system context pattern from `ReminderSchedulerService`:

```ts
for (const organizationId of await organizationRepo.findAllIds()) {
  await tenantContext.run(
    { userId: 'system', organizationId, role: Role.OWNER },
    () => recoverOrganization(organizationId, cutoff, 100),
  );
}
```

Catch and log failures per organization and per execution, then continue with the next item.

- [x] **Step 4: Rerun the recovery-service spec and the reminder module focused suite**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reminders/application/reminder-execution-recovery.service.spec.ts src/modules/reminders/application/reminder-sender.service.spec.ts src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts`

Expected: sweep selection, tenant isolation, status transitions, and resume behavior pass.

### Task 5: Verify architecture and repository checks

**Files:**
- Check: all files changed for issue #426, including the design spec and `GLOSSARY.md`.
- Check: `apps/backend/.claude/skills/domain-check.md` or the repository's configured `.claude/skills/domain-check.md` entry point.

- [x] **Step 1: Rerun the complete backend unit suite after final-review fixes**

Run: `pnpm --filter @casso-ar/backend test -- --runInBand`

Expected: all backend unit tests pass.

- [x] **Step 2: Rerun the full repository verification after final-review fixes**

Run: `pnpm verify`

Expected: all lint, type-check, architecture-check, and test tasks pass.

- [x] **Step 3: Rerun domain-check and inspect the final diff**

Run `/domain-check` using the repository instructions, then `git diff --check` and `git status --short`. Expected: no domain-boundary violations, malformed patches, or accidental local environment changes.

- [x] **Step 4: Update the spec with implemented behavior and observed validation**

Record the implementation refinements and observed verification results in the design spec. Final fresh verification is being repeated after this documentation update.
