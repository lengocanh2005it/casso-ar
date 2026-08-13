# Retention Job for INSERT-Only Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily job prunes 7 unbounded, INSERT-only tables (`audit_logs`, `ai_usage_logs`, `collection_activities`, `reminder_executions`, `webhook_inbox`, `idempotency_keys`, `alerts`) by age, and `idempotency_keys` rows stuck in `PENDING` past 5 minutes stop permanently blocking retries.

**Architecture:** One new `RetentionSchedulerService` (`common/retention/`) with a single `@Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })` method, mirroring `ReminderSchedulerService`'s existing `@Cron` pattern exactly — no BullMQ. It calls a new `deleteOlderThan(cutoff: Date): Promise<number>` method added to each table's existing repository port/adapter (six tables) plus two new methods on `IdempotencyService` (which has no port — it manages `IdempotencyKeyOrmEntity` directly, per existing precedent). Each table's delete is a single `DELETE ... WHERE <column> < cutoff` across all organizations — no per-org loop, no batching (see decisions below) — wrapped in its own try/catch so one table's failure never blocks the others.

**Tech Stack:** NestJS 11, TypeORM 1.1, `@nestjs/schedule` (`@Cron`, already registered via `ScheduleModule.forRoot()` in `app.module.ts`), Jest 30.

**Spec:** GitHub issue #118, `docs/adr/0015-idempotency-key-stale-pending-reclaim.md`, `CONTEXT.md` §"Business Rules" #9 (Retention Policy) and the `IdempotencyKey` entity entry — these three documents are the spec; this plan does not duplicate their content, it implements what they already decided.

## Global Constraints

- Money/transactions/persisted-rollup rules (AGENTS.md) do not apply — this plan deletes rows, it never touches `amount`/`status`/rollup fields.
- `application/` layer code must not throw `HttpException` or import concrete SDKs (AGENTS.md, `.claude/rules/application.md`) — not applicable here either: `RetentionSchedulerService` is a background job that never surfaces to HTTP, so it catches and logs errors instead of throwing.
- Domain ↔ ORM translation via explicit mapper, never a cast (AGENTS.md, `.claude/rules/infrastructure.md`) — not applicable: every new method is a delete-by-date, there is no ORM→domain translation involved.
- **Deliberate deviation from tenant isolation (AGENTS.md "every query/write must be scoped by `organizationId`"):** every new `deleteOlderThan`/`deleteReadOlderThan` method deletes **across all organizations** in one statement, with no `organizationId` filter. This is intentional (grilling decision #8) — retention policy is identical for every tenant, there is no per-tenant data exposure risk in a delete-by-age with no data returned to any caller, and looping per-org would just be N small `DELETE`s instead of one with no added safety.
- TDD RED → GREEN → REFACTOR for every task except Task 1 (migration + entity `@Index` decorators — config-only, per AGENTS.md's stated TDD exception).
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas — run `npx biome check --write .` before each commit if unsure.
- Module wiring order (`.claude/rules/module-wiring.md`): `imports` (`TypeOrmModule.forFeature` first, then modules) → `providers` (DI tokens first, then services) → `controllers` → `exports`.

## Design Decisions Carried From Grilling + Domain-Modeling (`CONTEXT.md`, ADR-0015)

1. **Retention windows (fixed, not configurable):** `webhook_inbox` 90d (by `receivedAt`), `idempotency_keys` COMPLETED 90d (by `createdAt`), `ai_usage_logs` 365d, `audit_logs`/`collection_activities`/`reminder_executions` 730d (all by `createdAt`), `alerts` 90d after `readAt` (unread rows, `readAt IS NULL`, are never pruned — see decision 5 below for why the SQL comparison alone achieves this).
2. **Idempotency `PENDING` reclaim (ADR-0015):** a `PENDING` row older than 5 minutes (`IDEMPOTENCY_STALE_PENDING_MS`) is stale. `IdempotencyService.execute` reclaims it inline (deletes + falls through to insert a fresh `PENDING` row) instead of rejecting with 409 forever. The retention job's `sweepStalePending()` is a backstop for stale rows nobody happens to retry — it reuses the exact same constant, not a second number.
3. **One `RetentionSchedulerService`, not one job per module.** It lives in `common/retention/` (a cross-cutting concern, like `common/idempotency/` and `common/audit/`) and depends on each table's existing port — it never writes raw SQL against another module's table directly.
4. **No batching.** Steady-state daily deletes are small (yesterday's expired rows only); a backfill of pre-existing old rows, if one is ever needed, is a separate one-off operation outside this job's scope.
5. **`LessThan(cutoff)` naturally excludes NULL columns.** SQL `"readAt" < $1` evaluates to `NULL` (not `TRUE`) when `"readAt" IS NULL`, so `alertRepo.deleteReadOlderThan()` never touches unread alerts without needing an explicit `IS NOT NULL` clause — this is standard SQL null-comparison semantics, not a TypeORM feature.
6. **Errors are isolated per table** (decision 12) — one table's delete failing is logged and does not stop the sweep for the other 7 (`idempotency_keys` counts as 2 sweeps: COMPLETED + stale PENDING).

---

### Task 1: Retention indexes — migration + entity `@Index` decorators

**Files:**
- Create: `apps/backend/src/database/migrations/20260815000000-add-retention-indexes.ts`
- Modify: `apps/backend/src/modules/collection-activity/infrastructure/collection-activity.orm-entity.ts`
- Modify: `apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts`
- Modify: `apps/backend/src/modules/webhooks/infrastructure/webhook-inbox.orm-entity.ts`
- Modify: `apps/backend/src/common/idempotency/idempotency-key.orm-entity.ts`

**Context:** `audit_logs` and `ai_usage_logs` already have `@Index(['organizationId', 'createdAt'])` — good enough for a `createdAt < cutoff` scan, no change needed. The other four tables have no index usable for a cutoff scan (see grilling decision 9). This task adds both the migration (drives `synchronize: false` in production, per `typeorm.config.ts`) and the matching entity `@Index` decorator (drives `synchronize: true` in dev) — see `receivable.orm-entity.ts:15-18` + `20260811000000-add-receivables-organization-created-at-index.ts` for the existing precedent of always shipping both together.

**No TDD** — this is the AGENTS.md-stated migration exception. Verified by running the migration up/down against a real Postgres in Task 9's e2e check, not by a unit test.

- [ ] **Step 1: Write the migration**

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetentionIndexes20260815000000
  implements MigrationInterface
{
  name = 'AddRetentionIndexes20260815000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_collection_activities_created_at" ON "collection_activities" ("createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_reminder_executions_created_at" ON "reminder_executions" ("createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_webhook_inbox_received_at" ON "webhook_inbox" ("receivedAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_idempotency_keys_created_at" ON "idempotency_keys" ("createdAt")',
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_idempotency_keys_pending_created_at" ON "idempotency_keys" ("status", "createdAt") WHERE "status" = 'PENDING'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_idempotency_keys_pending_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_idempotency_keys_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_webhook_inbox_received_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_reminder_executions_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_collection_activities_created_at"',
    );
  }
}
```

- [ ] **Step 2: Add the matching `@Index` to `CollectionActivityOrmEntity`**

In `collection-activity.orm-entity.ts`, change:

```typescript
@Entity({ name: 'collection_activities' })
@Index(['receivableId', 'createdAt'])
@Index(['customerId', 'createdAt'])
export class CollectionActivityOrmEntity {
```

to:

```typescript
@Entity({ name: 'collection_activities' })
@Index(['receivableId', 'createdAt'])
@Index(['customerId', 'createdAt'])
@Index('IDX_collection_activities_created_at', ['createdAt'])
export class CollectionActivityOrmEntity {
```

- [ ] **Step 3: Add the matching `@Index` to `ReminderExecutionOrmEntity`**

In `reminder-execution.orm-entity.ts`, change:

```typescript
@Entity('reminder_executions')
@Index(['organizationId', 'receivableId'])
@Index(['receivableId', 'reminderRuleId', 'executionDate'], { unique: true })
@Index(['organizationId', 'status', 'sentAt'])
export class ReminderExecutionOrmEntity {
```

to:

```typescript
@Entity('reminder_executions')
@Index(['organizationId', 'receivableId'])
@Index(['receivableId', 'reminderRuleId', 'executionDate'], { unique: true })
@Index(['organizationId', 'status', 'sentAt'])
@Index('IDX_reminder_executions_created_at', ['createdAt'])
export class ReminderExecutionOrmEntity {
```

- [ ] **Step 4: Add the matching `@Index` to `WebhookInboxOrmEntity`**

In `webhook-inbox.orm-entity.ts`, change:

```typescript
@Entity({ name: 'webhook_inbox' })
@Index(['organizationId', 'providerTransactionId'], { unique: true })
export class WebhookInboxOrmEntity {
```

to:

```typescript
@Entity({ name: 'webhook_inbox' })
@Index(['organizationId', 'providerTransactionId'], { unique: true })
@Index('IDX_webhook_inbox_received_at', ['receivedAt'])
export class WebhookInboxOrmEntity {
```

- [ ] **Step 5: Add the matching `@Index`es to `IdempotencyKeyOrmEntity`**

In `idempotency-key.orm-entity.ts`, change:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
@Index(['organizationId', 'endpoint', 'key'], { unique: true })
export class IdempotencyKeyOrmEntity {
```

to:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
@Index(['organizationId', 'endpoint', 'key'], { unique: true })
@Index('IDX_idempotency_keys_created_at', ['createdAt'])
@Index('IDX_idempotency_keys_pending_created_at', ['status', 'createdAt'], {
  where: `"status" = 'PENDING'`,
})
export class IdempotencyKeyOrmEntity {
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/database/migrations/20260815000000-add-retention-indexes.ts apps/backend/src/modules/collection-activity/infrastructure/collection-activity.orm-entity.ts apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts apps/backend/src/modules/webhooks/infrastructure/webhook-inbox.orm-entity.ts apps/backend/src/common/idempotency/idempotency-key.orm-entity.ts
git commit -m "chore: add retention-sweep indexes for issue #118"
```

---

### Task 2: `AuditLogRepository.deleteOlderThan`

**Files:**
- Modify: `apps/backend/src/common/audit/audit-log-repository.port.ts`
- Modify: `apps/backend/src/common/audit/typeorm-audit-log.repository.ts`
- Test: `apps/backend/src/common/audit/typeorm-audit-log.repository.spec.ts` (new file)

**Interfaces:**
- Produces: `IAuditLogRepository.deleteOlderThan(cutoff: Date): Promise<number>` — returns the count of deleted rows. `RetentionSchedulerService` (Task 9) calls this via `@Inject(AUDIT_LOG_REPOSITORY)`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/audit/typeorm-audit-log.repository.spec.ts`:

```typescript
import { TypeOrmAuditLogRepository } from './typeorm-audit-log.repository';

describe('TypeOrmAuditLogRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 42 });
    const repo = new TypeOrmAuditLogRepository({ delete: deleteMock } as any);
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(42);
  });

  it('returns 0 when nothing was deleted', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: null });
    const repo = new TypeOrmAuditLogRepository({ delete: deleteMock } as any);

    const result = await repo.deleteOlderThan(new Date());

    expect(result).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern common/audit/typeorm-audit-log.repository.spec.ts`
Expected: FAIL — `repo.deleteOlderThan is not a function`.

- [ ] **Step 3: Add `deleteOlderThan` to the port**

In `audit-log-repository.port.ts`, change:

```typescript
export interface IAuditLogRepository {
  create(log: AuditLog, manager?: EntityManager): Promise<void>;
  findPage(
    query: AuditLogPageQuery,
  ): Promise<{ items: AuditLog[]; total: number }>;
}
```

to:

```typescript
export interface IAuditLogRepository {
  create(log: AuditLog, manager?: EntityManager): Promise<void>;
  findPage(
    query: AuditLogPageQuery,
  ): Promise<{ items: AuditLog[]; total: number }>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 4: Implement in the repository**

In `typeorm-audit-log.repository.ts`, add `LessThan` to the `typeorm` import:

```typescript
import {
  Between,
  type EntityManager,
  type FindOptionsWhere,
  LessThan,
  type Repository,
} from 'typeorm';
```

and add the method to the class (after `findPage`):

```typescript
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern common/audit/typeorm-audit-log.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/audit/audit-log-repository.port.ts apps/backend/src/common/audit/typeorm-audit-log.repository.ts apps/backend/src/common/audit/typeorm-audit-log.repository.spec.ts
git commit -m "feat: add AuditLog retention delete for issue #118"
```

---

### Task 3: `AIUsageLogRepository.deleteOlderThan` + export the token

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts`
- Modify: `apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`
- Test: `apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.spec.ts` (new file)

**Interfaces:**
- Produces: `IAIUsageLogRepository.deleteOlderThan(cutoff: Date): Promise<number>`.
- `CopilotModule` currently has no `exports` key at all — `AI_USAGE_LOG_REPOSITORY` must be exported so Task 9's `RetentionModule` can import `CopilotModule` and inject it.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.spec.ts`:

```typescript
import { TypeOrmAIUsageLogRepository } from './typeorm-ai-usage-log.repository';

describe('TypeOrmAIUsageLogRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 7 });
    const repo = new TypeOrmAIUsageLogRepository(
      { delete: deleteMock } as any,
      { getOrganizationId: jest.fn() } as any,
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern copilot/infrastructure/typeorm-ai-usage-log.repository.spec.ts`
Expected: FAIL — `repo.deleteOlderThan is not a function`.

- [ ] **Step 3: Add `deleteOlderThan` to the port**

In `ai-usage-log-repository.port.ts`, change:

```typescript
export interface IAIUsageLogRepository {
  log(entry: AIUsageLogEntry): Promise<void>;
}
```

to:

```typescript
export interface IAIUsageLogRepository {
  log(entry: AIUsageLogEntry): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 4: Implement in the repository**

In `typeorm-ai-usage-log.repository.ts`, change the `typeorm` import:

```typescript
import { LessThan, Repository } from 'typeorm';
```

and add the method to the class (after `log`):

```typescript
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.ormRepo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern copilot/infrastructure/typeorm-ai-usage-log.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Export the token from `CopilotModule`**

In `copilot.module.ts`, add an `exports` array to the `@Module` decorator (there is currently none), right after `controllers`:

```typescript
  controllers: [CopilotController],
  providers: [
    // ...unchanged...
  ],
  exports: [AI_USAGE_LOG_REPOSITORY],
})
export class CopilotModule {}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.spec.ts apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: add AIUsageLog retention delete for issue #118"
```

---

### Task 4: `CollectionActivityRepository.deleteOlderThan`

**Files:**
- Modify: `apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts`
- Modify: `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts`
- Test: `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts` (existing file — add a `describe` block)

**Interfaces:**
- Produces: `ICollectionActivityRepository.deleteOlderThan(cutoff: Date): Promise<number>`. `COLLECTION_ACTIVITY_REPOSITORY` is already exported by `CollectionActivityModule` (`collection-activity.module.ts:32`) — no module change needed.

- [ ] **Step 1: Write the failing test**

Read the existing `typeorm-collection-activity.repository.spec.ts` first to match its constructor-mocking style, then append this `describe` block at the end of the file:

```typescript
describe('TypeOrmCollectionActivityRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 15 });
    const repo = new TypeOrmCollectionActivityRepository(
      { delete: deleteMock } as any,
      { getOrganizationId: jest.fn() } as any,
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts`
Expected: FAIL — `repo.deleteOlderThan is not a function`.

- [ ] **Step 3: Add `deleteOlderThan` to the port**

In `collection-activity-repository.port.ts`, change:

```typescript
export interface ICollectionActivityRepository {
  create(activity: CollectionActivity, manager?: EntityManager): Promise<void>;
  findByReceivableId(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  findByCustomerId(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  findByOrganizationId(
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
}
```

to:

```typescript
export interface ICollectionActivityRepository {
  create(activity: CollectionActivity, manager?: EntityManager): Promise<void>;
  findByReceivableId(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  findByCustomerId(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  findByOrganizationId(
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 4: Implement in the repository**

In `typeorm-collection-activity.repository.ts`, add `LessThan` to the `typeorm` import:

```typescript
import { LessThan, Repository } from 'typeorm';
```

and add the method to the class (after `findByOrganizationId`, using the protected `this.ormRepo` from `BaseRepository`):

```typescript
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.ormRepo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts
git commit -m "feat: add CollectionActivity retention delete for issue #118"
```

---

### Task 5: `ReminderExecutionRepository.deleteOlderThan`

**Files:**
- Modify: `apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts`
- Modify: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts`
- Test: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts` (create if it doesn't exist, else append)

**Interfaces:**
- Produces: `IReminderExecutionRepository.deleteOlderThan(cutoff: Date): Promise<number>`. Token `REMINDER_EXECUTION_REPOSITORY` is already exported by `CommonTokensModule` — no module change needed.

- [ ] **Step 1: Write the failing test**

Create (or append to) `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts`:

```typescript
import { TypeOrmReminderExecutionRepository } from './typeorm-reminder-execution.repository';

describe('TypeOrmReminderExecutionRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 23 });
    const getRepository = jest.fn().mockReturnValue({ delete: deleteMock });
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository } as any,
      { getOrganizationId: jest.fn() } as any,
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(23);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts`
Expected: FAIL — `repo.deleteOlderThan is not a function`.

- [ ] **Step 3: Add `deleteOlderThan` to the port**

In `reminder-execution-repository.port.ts`, add to the interface (after `updateSendResult`):

```typescript
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 4: Implement in the repository**

In `typeorm-reminder-execution.repository.ts`, change the `typeorm` import:

```typescript
import { type DataSource, type EntityManager, LessThan } from 'typeorm';
```

and add the method to the class (after `updateSendResult`, note this repository uses `this.dataSource` directly, not an injected `Repository`):

```typescript
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.spec.ts
git commit -m "feat: add ReminderExecution retention delete for issue #118"
```

---

### Task 6: `WebhookInboxRepository.deleteOlderThan`

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/webhook-inbox-repository.port.ts`
- Modify: `apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.ts`
- Test: `apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.spec.ts` (create if it doesn't exist, else append)

**Interfaces:**
- Produces: `IWebhookInboxRepository.deleteOlderThan(cutoff: Date): Promise<number>` — deletes by `receivedAt`, this table has no `createdAt` column. `WEBHOOK_INBOX_REPOSITORY` is already exported by `WebhooksModule` — no module change needed.

- [ ] **Step 1: Write the failing test**

Create (or append to) `apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.spec.ts`:

```typescript
import { TypeOrmWebhookInboxRepository } from './typeorm-webhook-inbox.repository';

describe('TypeOrmWebhookInboxRepository.deleteOlderThan', () => {
  it('deletes rows with receivedAt older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 9 });
    const repo = new TypeOrmWebhookInboxRepository({
      delete: deleteMock,
    } as any);
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      receivedAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern webhooks/infrastructure/typeorm-webhook-inbox.repository.spec.ts`
Expected: FAIL — `repo.deleteOlderThan is not a function`.

- [ ] **Step 3: Add `deleteOlderThan` to the port**

In `webhook-inbox-repository.port.ts`, change:

```typescript
export interface IWebhookInboxRepository {
  insert(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  save(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  findById(id: string, organizationId: string): Promise<WebhookInbox | null>;
  findPage(
    query: WebhookInboxPageQuery,
  ): Promise<{ items: WebhookInbox[]; total: number }>;
}
```

to:

```typescript
export interface IWebhookInboxRepository {
  insert(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  save(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  findById(id: string, organizationId: string): Promise<WebhookInbox | null>;
  findPage(
    query: WebhookInboxPageQuery,
  ): Promise<{ items: WebhookInbox[]; total: number }>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 4: Implement in the repository**

In `typeorm-webhook-inbox.repository.ts`, change the `typeorm` import:

```typescript
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { LessThan } from 'typeorm';
```

and add the method to the class (after `findPage`, using `this.repo`):

```typescript
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repo.delete({ receivedAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern webhooks/infrastructure/typeorm-webhook-inbox.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/webhook-inbox-repository.port.ts apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.ts apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.spec.ts
git commit -m "feat: add WebhookInbox retention delete for issue #118"
```

---

### Task 7: `AlertRepository.deleteReadOlderThan` + export the token

**Files:**
- Modify: `apps/backend/src/modules/alerts/application/alert-repository.port.ts`
- Modify: `apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts`
- Modify: `apps/backend/src/modules/alerts/alerts.module.ts`
- Test: `apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts` (existing file — add a `describe` block)

**Interfaces:**
- Produces: `IAlertRepository.deleteReadOlderThan(cutoff: Date): Promise<number>` — deletes only rows where `readAt < cutoff`; `readAt IS NULL` (unread) rows are never matched (decision 5 in this plan's header).
- `AlertsModule` currently has no `exports` key — `ALERT_REPOSITORY` must be exported for Task 9's `RetentionModule`.

- [ ] **Step 1: Write the failing test**

Read the existing `typeorm-alert.repository.spec.ts` first to match its `buildTenantContext`/constructor style (it takes `ormRepo`, `dataSource`, `tenantContext`), then append this `describe` block:

```typescript
describe('TypeOrmAlertRepository.deleteReadOlderThan', () => {
  it('deletes read rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 4 });
    const ormRepo = { delete: deleteMock } as any;
    const repo = new TypeOrmAlertRepository(
      ormRepo,
      { transaction: jest.fn() } as any,
      buildTenantContext(),
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteReadOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      readAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern alerts/infrastructure/typeorm-alert.repository.spec.ts`
Expected: FAIL — `repo.deleteReadOlderThan is not a function`.

- [ ] **Step 3: Add `deleteReadOlderThan` to the port**

In `alert-repository.port.ts`, change:

```typescript
  delete(id: string, userId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
}
```

to:

```typescript
  delete(id: string, userId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
  /** Prunes read alerts (`readAt` set) older than cutoff; never touches unread rows. */
  deleteReadOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 4: Implement in the repository**

In `typeorm-alert.repository.ts`, change the `typeorm` import:

```typescript
import { DataSource, IsNull, LessThan, Repository } from 'typeorm';
```

and add the method to the class (after `deleteAll`, using the protected `this.ormRepo`):

```typescript
  async deleteReadOlderThan(cutoff: Date): Promise<number> {
    const result = await this.ormRepo.delete({ readAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern alerts/infrastructure/typeorm-alert.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Export the token from `AlertsModule`**

In `alerts.module.ts`, add an `exports` array to the `@Module` decorator (there is currently none), after `providers`:

```typescript
    ReminderScanAlertListener,
  ],
  exports: [ALERT_REPOSITORY],
})
export class AlertsModule {}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/alerts/application/alert-repository.port.ts apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts apps/backend/src/modules/alerts/alerts.module.ts
git commit -m "feat: add Alert retention delete for issue #118"
```

---

### Task 8: `IdempotencyService` — stale-`PENDING` reclaim (ADR-0015) + retention deletes

**Files:**
- Modify: `apps/backend/src/common/idempotency/idempotency.service.ts`
- Test: `apps/backend/src/common/idempotency/idempotency.service.spec.ts` (existing file — add `describe` blocks)

**Interfaces:**
- Produces: `IdempotencyService.deleteCompletedOlderThan(cutoff: Date): Promise<number>`, `IdempotencyService.sweepStalePending(): Promise<number>` (no `cutoff` param — computes its own cutoff from the exported `IDEMPOTENCY_STALE_PENDING_MS` constant, so the request-time reclaim in `execute()` and the job backstop always agree on the same threshold, per ADR-0015's consequence that both must reuse one number).
- `IdempotencyService` is already provided by the `@Global()` `IdempotencyModule` — `RetentionSchedulerService` (Task 9) can inject it directly with no module import needed.

**This is the ADR-0015 fix** — before this task, a `PENDING` row older than 5 minutes rejects every retry with the same `Idempotency-Key` forever (409 `CONFLICT`). This task makes `execute()` reclaim it instead.

- [ ] **Step 1: Write the failing test (regression test for the stale-PENDING lockout)**

Read the existing `idempotency.service.spec.ts` first to match its `buildDataSource`-via-`jest.fn` style, then append these `describe` blocks:

```typescript
describe('IdempotencyService stale PENDING reclaim (ADR-0015)', () => {
  it('rejects with CONFLICT when the PENDING row is younger than 5 minutes', async () => {
    const found = {
      id: 'key-1',
      requestHash: 'same-hash',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 60_000), // 1 minute old
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(found),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repo) };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const tenant = new TenantContextService();
    const service = new IdempotencyService(dataSource as any, tenant);
    const canonical = JSON.stringify({ amount: 1 });
    const crypto = require('node:crypto');
    found.requestHash = crypto
      .createHash('sha256')
      .update(canonical)
      .digest('hex');

    await tenant.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await expect(
          service.execute(
            'POST /receivables',
            'key-1',
            { amount: 1 },
            jest.fn(),
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ errorCode: 'CONFLICT' }),
        });
      },
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('reclaims a PENDING row older than 5 minutes and re-executes the operation', async () => {
    const found = {
      id: 'key-1',
      requestHash: '',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 6 * 60_000), // 6 minutes old
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(found),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repo),
      update: jest.fn(),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const tenant = new TenantContextService();
    const service = new IdempotencyService(dataSource as any, tenant);
    const canonical = JSON.stringify({ amount: 1 });
    const crypto = require('node:crypto');
    found.requestHash = crypto
      .createHash('sha256')
      .update(canonical)
      .digest('hex');
    const operation = jest.fn().mockResolvedValue({ ok: true });

    await tenant.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await expect(
          service.execute('POST /receivables', 'key-1', { amount: 1 }, operation),
        ).resolves.toEqual({ ok: true });
      },
    );

    expect(repo.delete).toHaveBeenCalledWith({ id: 'key-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('IdempotencyService retention deletes', () => {
  it('deleteCompletedOlderThan deletes COMPLETED rows older than cutoff', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 12 });
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ delete: deleteMock }),
    };
    const service = new IdempotencyService(
      dataSource as any,
      new TenantContextService(),
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await service.deleteCompletedOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      status: 'COMPLETED',
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(12);
  });

  it('sweepStalePending deletes PENDING rows older than the 5-minute threshold', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 3 });
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ delete: deleteMock }),
    };
    const service = new IdempotencyService(
      dataSource as any,
      new TenantContextService(),
    );

    const result = await service.sweepStalePending();

    expect(deleteMock).toHaveBeenCalledWith({
      status: 'PENDING',
      createdAt: expect.objectContaining({ _type: 'lessThan' }),
    });
    expect(result).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern common/idempotency/idempotency.service.spec.ts`
Expected: FAIL — the "younger than 5 minutes" test fails because the current code has no age check at all (any PENDING row is always rejected, so this one accidentally passes); the "reclaims" and both retention-delete tests fail because `sweepStalePending`/`deleteCompletedOlderThan` don't exist yet, and reclaim behavior doesn't exist. Confirm at least the reclaim and retention-delete tests fail before continuing.

- [ ] **Step 3: Implement the fix**

In `idempotency.service.ts`, add the exported constant and `LessThan` import at the top:

```typescript
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, LessThan } from 'typeorm';
import { isUniqueViolation } from '../database/unique-violation';
import { ErrorCode } from '../errors/error-code';
import { TenantContextService } from '../tenancy/tenant-context';
import { IdempotencyKeyOrmEntity } from './idempotency-key.orm-entity';

// ADR-0015: a PENDING row older than this is presumed abandoned (crashed
// process) and is reclaimed instead of blocking retries forever. Reused by
// both the request-time reclaim in execute() and the retention job's
// sweepStalePending() backstop — do not introduce a second threshold.
export const IDEMPOTENCY_STALE_PENDING_MS = 5 * 60 * 1000;
```

Then change the `found` branch inside `execute()`'s transaction from:

```typescript
        if (found) {
          if (found.requestHash !== requestHash) {
            throw new ConflictException({
              errorCode: ErrorCode.IDEMPOTENCY_KEY_REUSED,
              message: 'Idempotency-Key đã được dùng cho dữ liệu khác.',
            });
          }
          if (found.status === 'COMPLETED') return found.response as T;
          throw new ConflictException({
            errorCode: ErrorCode.CONFLICT,
            message: 'Yêu cầu với Idempotency-Key này đang được xử lý.',
          });
        }
```

to:

```typescript
        if (found) {
          if (found.requestHash !== requestHash) {
            throw new ConflictException({
              errorCode: ErrorCode.IDEMPOTENCY_KEY_REUSED,
              message: 'Idempotency-Key đã được dùng cho dữ liệu khác.',
            });
          }
          if (found.status === 'COMPLETED') return found.response as T;
          const ageMs = Date.now() - found.createdAt.getTime();
          if (ageMs < IDEMPOTENCY_STALE_PENDING_MS) {
            throw new ConflictException({
              errorCode: ErrorCode.CONFLICT,
              message: 'Yêu cầu với Idempotency-Key này đang được xử lý.',
            });
          }
          // PENDING row is stale (ADR-0015): the process that created it is
          // presumed dead. Reclaim by deleting it and falling through to
          // insert a fresh PENDING row below.
          await repo.delete({ id: found.id });
        }
```

Then add the two new public methods at the end of the class (after `execute`):

```typescript
  async deleteCompletedOlderThan(cutoff: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(IdempotencyKeyOrmEntity)
      .delete({ status: 'COMPLETED', createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  async sweepStalePending(): Promise<number> {
    const cutoff = new Date(Date.now() - IDEMPOTENCY_STALE_PENDING_MS);
    const result = await this.dataSource
      .getRepository(IdempotencyKeyOrmEntity)
      .delete({ status: 'PENDING', createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern common/idempotency/idempotency.service.spec.ts`
Expected: PASS — all tests, including the two pre-existing ones.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/idempotency/idempotency.service.ts apps/backend/src/common/idempotency/idempotency.service.spec.ts
git commit -m "fix: reclaim stale idempotency PENDING rows after 5 minutes (ADR-0015, issue #118)"
```

---

### Task 9: `RetentionSchedulerService` + `RetentionModule` + wire into `AppModule`

**Files:**
- Create: `apps/backend/src/common/retention/retention-scheduler.service.ts`
- Create: `apps/backend/src/common/retention/retention-scheduler.service.spec.ts`
- Create: `apps/backend/src/common/retention/retention.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `IAuditLogRepository.deleteOlderThan` (Task 2), `IAIUsageLogRepository.deleteOlderThan` (Task 3), `ICollectionActivityRepository.deleteOlderThan` (Task 4), `IReminderExecutionRepository.deleteOlderThan` (Task 5), `IWebhookInboxRepository.deleteOlderThan` (Task 6), `IAlertRepository.deleteReadOlderThan` (Task 7), `IdempotencyService.deleteCompletedOlderThan`/`sweepStalePending` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/retention/retention-scheduler.service.spec.ts`:

```typescript
import { RetentionSchedulerService } from './retention-scheduler.service';

function buildDeps() {
  return {
    auditLogRepo: { deleteOlderThan: jest.fn().mockResolvedValue(1) } as any,
    aiUsageLogRepo: { deleteOlderThan: jest.fn().mockResolvedValue(2) } as any,
    collectionActivityRepo: {
      deleteOlderThan: jest.fn().mockResolvedValue(3),
    } as any,
    reminderExecutionRepo: {
      deleteOlderThan: jest.fn().mockResolvedValue(4),
    } as any,
    webhookInboxRepo: { deleteOlderThan: jest.fn().mockResolvedValue(5) } as any,
    alertRepo: { deleteReadOlderThan: jest.fn().mockResolvedValue(6) } as any,
    idempotencyService: {
      deleteCompletedOlderThan: jest.fn().mockResolvedValue(7),
      sweepStalePending: jest.fn().mockResolvedValue(8),
    } as any,
  };
}

describe('RetentionSchedulerService.prune', () => {
  it('sweeps all 7 tables with their configured cutoffs', async () => {
    const deps = buildDeps();
    const service = new RetentionSchedulerService(
      deps.auditLogRepo,
      deps.aiUsageLogRepo,
      deps.collectionActivityRepo,
      deps.reminderExecutionRepo,
      deps.webhookInboxRepo,
      deps.alertRepo,
      deps.idempotencyService,
    );

    await service.prune();

    expect(deps.auditLogRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.aiUsageLogRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.collectionActivityRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.reminderExecutionRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.webhookInboxRepo.deleteOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.alertRepo.deleteReadOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.idempotencyService.deleteCompletedOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(deps.idempotencyService.sweepStalePending).toHaveBeenCalledWith();
  });

  it('continues sweeping remaining tables when one table throws', async () => {
    const deps = buildDeps();
    deps.auditLogRepo.deleteOlderThan.mockRejectedValue(new Error('db down'));
    const service = new RetentionSchedulerService(
      deps.auditLogRepo,
      deps.aiUsageLogRepo,
      deps.collectionActivityRepo,
      deps.reminderExecutionRepo,
      deps.webhookInboxRepo,
      deps.alertRepo,
      deps.idempotencyService,
    );

    await service.prune();

    expect(deps.aiUsageLogRepo.deleteOlderThan).toHaveBeenCalled();
    expect(deps.webhookInboxRepo.deleteOlderThan).toHaveBeenCalled();
    expect(deps.idempotencyService.sweepStalePending).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern common/retention/retention-scheduler.service.spec.ts`
Expected: FAIL — `Cannot find module './retention-scheduler.service'`.

- [ ] **Step 3: Implement `RetentionSchedulerService`**

Create `apps/backend/src/common/retention/retention-scheduler.service.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AUDIT_LOG_REPOSITORY } from '../audit/audit-log-repository.port';
import type { IAuditLogRepository } from '../audit/audit-log-repository.port';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { REMINDER_EXECUTION_REPOSITORY } from '../tokens/reminder-execution.token';
import { ALERT_REPOSITORY } from '../../modules/alerts/application/alert-repository.port';
import type { IAlertRepository } from '../../modules/alerts/application/alert-repository.port';
import { COLLECTION_ACTIVITY_REPOSITORY } from '../../modules/collection-activity/application/collection-activity-repository.port';
import type { ICollectionActivityRepository } from '../../modules/collection-activity/application/collection-activity-repository.port';
import { AI_USAGE_LOG_REPOSITORY } from '../../modules/copilot/application/ai-usage-log-repository.port';
import type { IAIUsageLogRepository } from '../../modules/copilot/application/ai-usage-log-repository.port';
import type { IReminderExecutionRepository } from '../../modules/reminders/application/reminder-execution-repository.port';
import { WEBHOOK_INBOX_REPOSITORY } from '../../modules/webhooks/application/webhook-inbox-repository.port';
import type { IWebhookInboxRepository } from '../../modules/webhooks/application/webhook-inbox-repository.port';

export const RETENTION_TIMEZONE = 'Asia/Ho_Chi_Minh';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

@Injectable()
export class RetentionSchedulerService {
  private readonly logger = new Logger(RetentionSchedulerService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly aiUsageLogRepo: IAIUsageLogRepository,
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly collectionActivityRepo: ICollectionActivityRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderExecutionRepo: IReminderExecutionRepository,
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly webhookInboxRepo: IWebhookInboxRepository,
    @Inject(ALERT_REPOSITORY)
    private readonly alertRepo: IAlertRepository,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Cron('0 3 * * *', { timeZone: RETENTION_TIMEZONE })
  async prune(): Promise<void> {
    await this.sweep('audit_logs', () =>
      this.auditLogRepo.deleteOlderThan(daysAgo(730)),
    );
    await this.sweep('ai_usage_logs', () =>
      this.aiUsageLogRepo.deleteOlderThan(daysAgo(365)),
    );
    await this.sweep('collection_activities', () =>
      this.collectionActivityRepo.deleteOlderThan(daysAgo(730)),
    );
    await this.sweep('reminder_executions', () =>
      this.reminderExecutionRepo.deleteOlderThan(daysAgo(730)),
    );
    await this.sweep('webhook_inbox', () =>
      this.webhookInboxRepo.deleteOlderThan(daysAgo(90)),
    );
    await this.sweep('idempotency_keys(completed)', () =>
      this.idempotencyService.deleteCompletedOlderThan(daysAgo(90)),
    );
    await this.sweep('idempotency_keys(stale_pending)', () =>
      this.idempotencyService.sweepStalePending(),
    );
    await this.sweep('alerts(read)', () =>
      this.alertRepo.deleteReadOlderThan(daysAgo(90)),
    );
  }

  private async sweep(table: string, run: () => Promise<number>): Promise<void> {
    try {
      const deleted = await run();
      this.logger.log({ message: 'Retention sweep completed', table, deleted });
    } catch (error) {
      this.logger.error({
        message: 'Retention sweep failed',
        table,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern common/retention/retention-scheduler.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Create `RetentionModule`**

Create `apps/backend/src/common/retention/retention.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AlertsModule } from '../../modules/alerts/alerts.module';
import { CollectionActivityModule } from '../../modules/collection-activity/collection-activity.module';
import { CopilotModule } from '../../modules/copilot/copilot.module';
import { WebhooksModule } from '../../modules/webhooks/webhooks.module';
import { CommonTokensModule } from '../tokens/common-tokens.module';
import { RetentionSchedulerService } from './retention-scheduler.service';

@Module({
  imports: [
    CommonTokensModule,
    CopilotModule,
    CollectionActivityModule,
    WebhooksModule,
    AlertsModule,
  ],
  providers: [RetentionSchedulerService],
})
export class RetentionModule {}
```

`AUDIT_LOG_REPOSITORY` (from `@Global()` `AuditModule`) and `IdempotencyService` (from `@Global()` `IdempotencyModule`) need no import here — both modules are already global and imported once in `app.module.ts`.

- [ ] **Step 6: Wire `RetentionModule` into `AppModule`**

In `app.module.ts`, add the import (near the other `common/` imports, after `CommonTokensModule`):

```typescript
import { CommonTokensModule } from './common/tokens/common-tokens.module';
import { RetentionModule } from './common/retention/retention.module';
```

and add `RetentionModule` to the `imports` array (after `IdempotencyModule`, since it depends on modules that come later in the list too — Nest resolves this by provider token at runtime, so array order here doesn't matter, but keep it near the other `common/` modules for readability):

```typescript
    CommonTokensModule,
    IdempotencyModule,
    RetentionModule,
    AuditModule,
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Boot the app to verify DI wiring resolves**

Run: `pnpm dev:backend`
Expected: Nest boots without a `UnknownDependenciesException`/circular-dependency error. Stop the process (Ctrl+C) once you see `Nest application successfully started`.

- [ ] **Step 9: Run the full unit test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: PASS — all tests, including all specs written in Tasks 2–9.

- [ ] **Step 10: Run migrations against a real database (if Docker is available)**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS. This exercises `synchronize`/migrations against a real testcontainers Postgres, verifying Task 1's migration and `@Index` decorators don't conflict (both create the same index name, `CREATE INDEX IF NOT EXISTS` makes this idempotent either way it runs first).

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/common/retention/retention-scheduler.service.ts apps/backend/src/common/retention/retention-scheduler.service.spec.ts apps/backend/src/common/retention/retention.module.ts apps/backend/src/app.module.ts
git commit -m "feat: add daily RetentionSchedulerService for issue #118"
```

---

## Self-Review Notes

- **Spec coverage:** all 7 tables from the issue have a `deleteOlderThan`/`deleteReadOlderThan` task (2–7 cover 6 tables directly; `idempotency_keys` is covered by Task 8's `deleteCompletedOlderThan` + `sweepStalePending`); the ADR-0015 stale-PENDING fix is Task 8; the scheduler tying them together on the agreed cron/timezone/error-isolation is Task 9; the migration + indexes decision is Task 1. No gaps found.
- **No placeholders:** every step has literal code, not a description of code.
- **Type consistency:** `deleteOlderThan(cutoff: Date): Promise<number>` signature is identical across all 6 ports; `IdempotencyService`'s two methods and `RetentionSchedulerService`'s injected types match the exact interface names/tokens defined in Tasks 2–8.
