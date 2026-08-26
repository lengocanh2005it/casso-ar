# Audit `relatedReceivableId` Correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every receivable-relevant `audit_logs` row a queryable `relatedReceivableId`, so issue #360 can filter `GET /audit-logs` by receivable without a runtime `SUM`/multi-entity join.

**Architecture:** Add a nullable, indexed `relatedReceivableId` column to `audit_logs`. Populate it two ways: (a) generically inside `AuditInterceptor` — the interceptor already backs every `@Audited()` call site — for actions whose `entityType` is already `RECEIVABLE`, or whose response/route params carry a `receivableId` field; (b) explicitly inside the one shared method that already underlies every kind of payment allocation (`AllocatePaymentUseCase.allocateWithinTransaction`), which both the direct `/payments/:id/allocate` endpoint and the bank-transaction match flow (single and batch) call once per receivable — so writing the audit log there gives correct per-receivable fan-out for match actions with **zero** changes to the match use cases themselves.

**Tech Stack:** NestJS 11, TypeORM 1.1 migrations, PostgreSQL 16 (`jsonb`), Jest 30.

## Global Constraints

- Money stays integer VND — this plan touches no money fields, only audit metadata.
- Every write to `relatedReceivableId` that happens inside an existing DB transaction MUST use that transaction's `EntityManager` (`IAuditLogRepository.create(log, manager)`), never a separate fire-and-forget write, to stay consistent with the sibling `UndoPaymentAllocationUseCase` pattern.
- `relatedReceivableId` is **optional** on `AuditLogProps` (defaults to `null`) — this MUST NOT force a change to any of the ~15 existing `new AuditLog({...})` call sites unrelated to receivables (auth, SMTP config, bank connections, email templates, invoice import, payos, webhook reprocess, etc.).
- No backfill of historical `audit_logs` rows (decided during grilling — some old rows, e.g. `PAYMENT_ALLOCATE` before this change, don't carry enough data to backfill from).
- No new API endpoint, no frontend work — that is issue #360, which depends on this issue (#369) and consumes `relatedReceivableId`, it doesn't produce it.
- `AllocatePaymentUseCase.allocateWithinTransaction` only writes the new audit log when `input.allocatedByUserId` is a real user id — `AuditLog.userId` is a required, non-nullable string, and `allocatedByUserId` is `string | null` (webhook auto-matching in `process-webhook.usecase.ts` calls it with `null`, `provenance.actorType: BalanceHistoryActorType.WEBHOOK`, i.e. no human actor). Deciding a "system" sentinel for `audit_logs.userId` is out of scope for this issue; skip the write rather than inventing one.

---

### Task 1: Migration — add `relatedReceivableId` to `audit_logs`

**Files:**
- Create: `apps/backend/src/database/migrations/20260907000000-add-audit-logs-related-receivable-id.ts`
- Test: `apps/backend/src/database/migrations/20260907000000-add-audit-logs-related-receivable-id.spec.ts`

**Interfaces:**
- Produces: a nullable `"relatedReceivableId"` varchar column and an index `IDX_audit_logs_org_related_receivable_id` on `audit_logs`. Later tasks (2–6) write to this column via the ORM entity from Task 2, not via raw SQL — this task only owns the migration.

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/backend/src/database/migrations/20260907000000-add-audit-logs-related-receivable-id.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddAuditLogsRelatedReceivableId20260907000000 } from './20260907000000-add-audit-logs-related-receivable-id';

describe('AddAuditLogsRelatedReceivableId20260907000000', () => {
  it('adds the nullable relatedReceivableId column and an index', async () => {
    const migration = new AddAuditLogsRelatedReceivableId20260907000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "relatedReceivableId" character varying',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_org_related_receivable_id" ON "audit_logs" ("organizationId", "relatedReceivableId")',
    );
  });

  it('reverts by dropping the index then the column', async () => {
    const migration = new AddAuditLogsRelatedReceivableId20260907000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'DROP INDEX IF EXISTS "IDX_audit_logs_org_related_receivable_id"',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "relatedReceivableId"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns 20260907000000-add-audit-logs-related-receivable-id`
Expected: FAIL with "Cannot find module './20260907000000-add-audit-logs-related-receivable-id'"

- [ ] **Step 3: Write the migration**

```typescript
// apps/backend/src/database/migrations/20260907000000-add-audit-logs-related-receivable-id.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogsRelatedReceivableId20260907000000
  implements MigrationInterface
{
  name = 'AddAuditLogsRelatedReceivableId20260907000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "relatedReceivableId" character varying',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_org_related_receivable_id" ON "audit_logs" ("organizationId", "relatedReceivableId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_audit_logs_org_related_receivable_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "relatedReceivableId"',
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns 20260907000000-add-audit-logs-related-receivable-id`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260907000000-add-audit-logs-related-receivable-id.ts apps/backend/src/database/migrations/20260907000000-add-audit-logs-related-receivable-id.spec.ts
git commit -m "feat: add relatedReceivableId column migration to audit_logs"
```

---

### Task 2: `AuditLog` domain + ORM entity + repository mapper carry `relatedReceivableId`

**Files:**
- Create: `apps/backend/src/common/audit/audit-log.spec.ts`
- Modify: `apps/backend/src/common/audit/audit-log.ts`
- Modify: `apps/backend/src/common/audit/audit-log.orm-entity.ts`
- Modify: `apps/backend/src/common/audit/typeorm-audit-log.repository.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (this task edits the ORM entity directly; `synchronize: true` in e2e tests derives schema from the entity, and the migration from Task 1 keeps a real Postgres deploy in sync).
- Produces: `AuditLogProps.relatedReceivableId?: string | null`, `AuditLog.relatedReceivableId: string | null` (defaults to `null`), `AuditLogOrmEntity.relatedReceivableId: string | null`. Tasks 3–6 construct `new AuditLog({ ..., relatedReceivableId: <value> })`.

- [ ] **Step 1: Write the failing domain test**

```typescript
// apps/backend/src/common/audit/audit-log.spec.ts
import { AuditActionType, AuditEntityType } from './audit.enums';
import { AuditLog } from './audit-log';

describe('AuditLog', () => {
  function baseProps() {
    return {
      organizationId: 'org-1',
      userId: 'user-1',
      actionType: AuditActionType.RECEIVABLE_CREATE,
      entityType: AuditEntityType.RECEIVABLE,
      entityId: 'rec-1',
      beforeState: null,
      afterState: null,
      ipAddress: null,
      createdAt: new Date('2026-08-26'),
    };
  }

  it('defaults relatedReceivableId to null when omitted', () => {
    const log = new AuditLog(baseProps());

    expect(log.relatedReceivableId).toBeNull();
  });

  it('keeps an explicit relatedReceivableId', () => {
    const log = new AuditLog({ ...baseProps(), relatedReceivableId: 'rec-9' });

    expect(log.relatedReceivableId).toBe('rec-9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns common/audit/audit-log.spec`
Expected: FAIL — `log.relatedReceivableId` is `undefined`, not `null` (property doesn't exist yet)

- [ ] **Step 3: Add the field to the domain class**

Edit `apps/backend/src/common/audit/audit-log.ts`:

```typescript
export interface AuditLogProps {
  id?: string;
  organizationId: string;
  userId: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  relatedReceivableId?: string | null;
}

export class AuditLog implements AuditLogProps {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly actionType: AuditActionType;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly beforeState: Record<string, unknown> | null;
  readonly afterState: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly relatedReceivableId: string | null;

  constructor(props: AuditLogProps) {
    this.id = props.id ?? randomUUID();
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.actionType = props.actionType;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.beforeState = props.beforeState;
    this.afterState = props.afterState;
    this.ipAddress = props.ipAddress;
    this.createdAt = props.createdAt;
    this.relatedReceivableId = props.relatedReceivableId ?? null;
  }
}
```

(Only the additions are shown — keep the existing `id`/`randomUUID()` line and imports as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns common/audit/audit-log.spec`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the column to the ORM entity**

Edit `apps/backend/src/common/audit/audit-log.orm-entity.ts` — add after the `ipAddress` column:

```typescript
  @Column({ type: 'varchar', nullable: true })
  relatedReceivableId: string | null;
```

- [ ] **Step 6: Wire the mapper and select list**

Edit `apps/backend/src/common/audit/typeorm-audit-log.repository.ts` — add `relatedReceivableId: log.relatedReceivableId,` to `toOrm`, `relatedReceivableId: row.relatedReceivableId,` to `toDomain`, and `relatedReceivableId: true,` to `AUDIT_LOG_SELECT`:

```typescript
function toOrm(log: AuditLog): AuditLogOrmEntity {
  return {
    id: log.id,
    organizationId: log.organizationId,
    userId: log.userId,
    actionType: log.actionType,
    entityType: log.entityType,
    entityId: log.entityId,
    beforeState: log.beforeState,
    afterState: log.afterState,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
    relatedReceivableId: log.relatedReceivableId,
  };
}

function toDomain(row: AuditLogOrmEntity): AuditLog {
  return new AuditLog({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeState: row.beforeState,
    afterState: row.afterState,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
    relatedReceivableId: row.relatedReceivableId,
  });
}

const AUDIT_LOG_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  actionType: true,
  entityType: true,
  entityId: true,
  beforeState: true,
  afterState: true,
  ipAddress: true,
  createdAt: true,
  relatedReceivableId: true,
} as const;
```

Do NOT touch `findPage`'s `where` clause or `AuditLogPageQuery` — filtering by `relatedReceivableId` is issue #360's job.

- [ ] **Step 7: Run the full audit unit suite to verify nothing broke**

Run: `cd apps/backend && npx jest --testPathPatterns common/audit`
Expected: PASS (all suites in `common/audit/`)

- [ ] **Step 8: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/audit/audit-log.ts apps/backend/src/common/audit/audit-log.spec.ts apps/backend/src/common/audit/audit-log.orm-entity.ts apps/backend/src/common/audit/typeorm-audit-log.repository.ts
git commit -m "feat: add relatedReceivableId to AuditLog domain, ORM entity, and repository mapper"
```

---

### Task 3: `AuditInterceptor` infers `relatedReceivableId` generically

**Files:**
- Modify: `apps/backend/src/common/audit/audit.interceptor.ts`
- Modify: `apps/backend/src/common/audit/audit.interceptor.spec.ts`

**Interfaces:**
- Consumes: `AuditLogProps.relatedReceivableId` (Task 2).
- Produces: every `@Audited()`-decorated endpoint now writes `relatedReceivableId` automatically — no controller changes needed. This covers `RECEIVABLE_CREATE`, `RECEIVABLE_WRITE_OFF` (single), `RECEIVABLE_CANCEL` (single), `DISPUTE_OPEN`, `DISPUTE_RESOLVE` for #360 with zero further work in this plan.

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/common/audit/audit.interceptor.spec.ts` (after the existing `'writes a sanitized audit log after a decorated handler succeeds'` test):

```typescript
  it('sets relatedReceivableId to entityId when entityType is RECEIVABLE', async () => {
    const { interceptor, auditContext, auditLogRepo } = buildInterceptor({
      actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
      entityType: AuditEntityType.RECEIVABLE,
    });
    const context = buildContext(
      {
        actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
        entityType: AuditEntityType.RECEIVABLE,
      },
      { id: 'rec-1' },
    );
    const handler: CallHandler = {
      handle: () => {
        auditContext.setBefore({ id: 'rec-1', status: 'OPEN' });
        return of({ id: 'rec-1', status: 'WRITTEN_OFF' });
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ relatedReceivableId: 'rec-1' }),
    );
  });

  it('sets relatedReceivableId from a receivableId field on the response body', async () => {
    const { interceptor, auditLogRepo } = buildInterceptor({
      actionType: AuditActionType.DISPUTE_OPEN,
      entityType: AuditEntityType.DISPUTE,
    });
    const context = buildContext(
      {
        actionType: AuditActionType.DISPUTE_OPEN,
        entityType: AuditEntityType.DISPUTE,
      },
      { receivableId: 'rec-9' },
    );
    const handler: CallHandler = {
      handle: () => of({ id: 'dispute-1', receivableId: 'rec-9', status: 'OPEN' }),
    };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'dispute-1',
        relatedReceivableId: 'rec-9',
      }),
    );
  });

  it('leaves relatedReceivableId unset for audited actions unrelated to a receivable', async () => {
    const { interceptor, auditLogRepo } = buildInterceptor({
      actionType: AuditActionType.SMTP_CONFIG_SAVE,
      entityType: AuditEntityType.SMTP_CONFIG,
    });
    const context = buildContext(
      {
        actionType: AuditActionType.SMTP_CONFIG_SAVE,
        entityType: AuditEntityType.SMTP_CONFIG,
      },
      { id: 'smtp-1' },
    );
    const handler: CallHandler = { handle: () => of({ success: true }) };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ relatedReceivableId: null }),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPatterns common/audit/audit.interceptor.spec`
Expected: FAIL — 3 new tests fail because `relatedReceivableId` is never set (all assertions see `undefined` or the field missing from the `AuditLog` passed to `create`)

- [ ] **Step 3: Implement the inference in the interceptor**

Edit `apps/backend/src/common/audit/audit.interceptor.ts`:

```typescript
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TenantContextService } from '../tenancy/tenant-context';
import { AuditContextService } from './audit-context';
import { AuditEntityType } from './audit.enums';
import { AuditLog } from './audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from './audit-log-repository.port';
import {
  AUDITED_METADATA_KEY,
  type AuditedMetadata,
} from './audited.decorator';
import { sanitizeAuditPayload } from './sanitize-audit-payload';

interface RequestLike {
  params?: Record<string, string | undefined>;
  ip?: string;
}

function responseId(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  return undefined;
}

function responseReceivableId(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === 'object' &&
    'receivableId' in value &&
    typeof value.receivableId === 'string'
  ) {
    return value.receivableId;
  }
  return undefined;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditContext: AuditContextService,
    private readonly tenantContext: TenantContextService,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<
      AuditedMetadata | undefined
    >(AUDITED_METADATA_KEY, [context.getHandler(), context.getClass()]);
    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<RequestLike>();
    return new Observable((subscriber) => {
      this.auditContext.run(() => {
        next
          .handle()
          .pipe(
            tap((response) => {
              const user = this.tenantContext.getCurrentUser();
              if (!user) return;

              const entityId = request.params?.id ?? responseId(response) ?? '';
              const relatedReceivableId =
                metadata.entityType === AuditEntityType.RECEIVABLE
                  ? entityId
                  : (request.params?.receivableId ??
                    responseReceivableId(response) ??
                    null);
              const log = new AuditLog({
                organizationId: user.organizationId,
                userId: user.userId,
                actionType: metadata.actionType,
                entityType: metadata.entityType,
                entityId,
                relatedReceivableId,
                beforeState: sanitizeAuditPayload(
                  this.auditContext.getBefore(),
                ),
                afterState: sanitizeAuditPayload(response),
                ipAddress: request.ip ?? null,
                createdAt: new Date(),
              });
              // ponytail: audit is fire-and-forget per the plan; keep a failed
              // audit write from turning a successful business request into 500.
              void this.auditLogRepo.create(log).catch((error: unknown) => {
                this.logger.error({
                  message: 'Failed to write audit log',
                  actionType: metadata.actionType,
                  entityType: metadata.entityType,
                  entityId,
                  organizationId: user.organizationId,
                  userId: user.userId,
                  error,
                });
              });
            }),
          )
          .subscribe(subscriber);
      });
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns common/audit/audit.interceptor.spec`
Expected: PASS (all tests, including the 3 new ones and the 4 pre-existing ones)

- [ ] **Step 5: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/audit/audit.interceptor.ts apps/backend/src/common/audit/audit.interceptor.spec.ts
git commit -m "feat: infer relatedReceivableId generically in AuditInterceptor"
```

---

### Task 4: `AllocatePaymentUseCase` writes a transactional audit log with `relatedReceivableId`

This single change covers the direct `/payments/:id/allocate` endpoint AND both bank-transaction match paths (single `:id/match` and `batch-match`), because both call `AllocatePaymentUseCase.allocateWithinTransaction` once per receivable allocation (see `match-bank-transaction.usecase.ts:200-222`). No changes to `match-bank-transaction.usecase.ts` or `batch-match-bank-transaction.usecase.ts` are needed — this is what gives correct per-receivable audit-log fan-out "for free."

**Files:**
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`
- Modify: `apps/backend/src/modules/payments/presentation/payments.controller.ts`

**Interfaces:**
- Consumes: `AUDIT_LOG_REPOSITORY` / `IAuditLogRepository` (already globally provided by `@Global() AuditModule` — no module-wiring changes needed in `payments.module.ts`).
- Produces: for every real (non-webhook, non-null-actor) allocation, one `audit_logs` row with `actionType: 'PAYMENT_ALLOCATE'`, `entityType: 'PaymentAllocation'`, `entityId: <allocation.id>`, `relatedReceivableId: <receivableId>`, `afterState` containing the full `PaymentAllocation` (receivableId, paymentId, allocatedAmount, allocatedByUserId, allocatedAt) instead of today's empty `{success:true}`.

- [ ] **Step 1: Write the failing test**

Edit `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts` — in the FIRST test (`'allocates payment to receivable and saves both inside a transaction'`), add an `auditLogRepo` mock, pass it as the new last constructor argument, and assert on it:

```typescript
    const recorder = { record: jest.fn() };
    const ledgerRecorder = { record: jest.fn() };
    const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
      auditContext as any,
      eventEmitter as any,
      recorder as any,
      ledgerRecorder as any,
      auditLogRepo as any,
    );
```

(This replaces the existing `const recorder = ...` / `const ledgerRecorder = ...` / `const useCase = new AllocatePaymentUseCase(...)` block — same 9 original args, `auditLogRepo` appended as the 10th.)

Then add this assertion after the existing `expect(allocationRepo.save).toHaveBeenCalled();` line:

```typescript
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PAYMENT_ALLOCATE',
        entityType: 'PaymentAllocation',
        relatedReceivableId: 'rec-1',
        afterState: expect.objectContaining({
          receivableId: 'rec-1',
          paymentId: 'pay-1',
          allocatedAmount: 30_000_000,
        }),
      }),
      expect.anything(),
    );
```

Every OTHER `new AllocatePaymentUseCase(` call in this file (there are 8 more, in the remaining `it(...)` blocks) will now be short one constructor argument. For each of them, append `{ create: jest.fn() } as any,` as the new final argument before the closing `);` of the constructor call — e.g.:

```typescript
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      { emit: jest.fn(), emitAsync: jest.fn() } as any,
      { record: jest.fn() } as any,
      { record: jest.fn() } as any,
      { create: jest.fn() } as any,
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns allocate-payment.usecase.spec`
Expected: FAIL — TypeScript compile error "Expected 10 arguments, but got 9" on every unmodified call site, or (once all 9 are updated) the new `auditLogRepo.create` assertion fails because nothing calls it yet

- [ ] **Step 3: Implement the audit write**

Edit `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts` — add imports:

```typescript
import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ar/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AppError } from '../../../common/errors/app-error';
```

(Everything else in the import block stays the same.)

Add the new constructor parameter as the LAST one (minimizes the diff across the 9 existing test call sites):

```typescript
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly auditContext: AuditContextService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly historyRecorder: ReceivableBalanceHistoryRecorderService,
    private readonly ledgerRecorder: LedgerEventRecorderService,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
  ) {}
```

Insert the audit write right after `await this.allocationRepo.save(allocation, manager);` inside `allocateWithinTransaction`, before `await this.historyRecorder.record(...)`:

```typescript
    await this.allocationRepo.save(allocation, manager);
    if (input.allocatedByUserId) {
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: this.tenantContext.getOrganizationId(),
          userId: input.allocatedByUserId,
          actionType: AuditActionType.PAYMENT_ALLOCATE,
          entityType: AuditEntityType.PAYMENT_ALLOCATION,
          entityId: allocation.id,
          relatedReceivableId: input.receivableId,
          beforeState: null,
          afterState: { ...allocation },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    }
    await this.historyRecorder.record({
```

(The `input.allocatedByUserId` guard is deliberate — see Global Constraints. Webhook auto-matching in `process-webhook.usecase.ts` calls this method with `allocatedByUserId: null` and correctly gets no audit row.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns allocate-payment.usecase.spec`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Remove the now-redundant `@Audited()` decorator from the controller**

Edit `apps/backend/src/modules/payments/presentation/payments.controller.ts` — remove these 3 now-unused imports:

```typescript
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
```

and remove the decorator line from the `allocate` handler:

```typescript
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async allocate(
```

(`@Audited(AuditActionType.PAYMENT_ALLOCATE, AuditEntityType.PAYMENT)` is deleted — the use case now writes a strictly better audit record itself. The HTTP response body, `{ success: true }`, is unchanged.)

- [ ] **Step 6: Run the full payments unit suite and type-check**

Run: `cd apps/backend && npx jest --testPathPatterns modules/payments && npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payments/application/allocate-payment.usecase.ts apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts apps/backend/src/modules/payments/presentation/payments.controller.ts
git commit -m "feat: write a transactional audit log with relatedReceivableId on payment allocation"
```

---

### Task 5: `UndoPaymentAllocationUseCase` sets `relatedReceivableId`

**Files:**
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts:139-152`
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts:97-100`

**Interfaces:**
- Consumes: `AuditLogProps.relatedReceivableId` (Task 2). No constructor change — this use case already injects `AUDIT_LOG_REPOSITORY`.

- [ ] **Step 1: Write the failing test**

Edit `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts` — change the existing assertion:

```typescript
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PAYMENT_ALLOCATE_UNDO',
        relatedReceivableId: 'rec-1',
      }),
      manager,
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns undo-payment-allocation.usecase.spec`
Expected: FAIL — `relatedReceivableId` is not present on the object passed to `create`

- [ ] **Step 3: Implement**

Edit `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts` — add one line to the existing `new AuditLog({...})` call:

```typescript
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: allocation.organizationId,
          userId: input.deletedByUserId,
          actionType: AuditActionType.PAYMENT_ALLOCATE_UNDO,
          entityType: AuditEntityType.PAYMENT_ALLOCATION,
          entityId: allocation.id,
          relatedReceivableId: allocation.receivableId,
          beforeState: { ...allocation },
          afterState: { ...undoneAllocation },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns undo-payment-allocation.usecase.spec`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts
git commit -m "feat: set relatedReceivableId on payment allocation undo audit log"
```

---

### Task 6: Batch write-off/cancel set `relatedReceivableId`

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.ts:44-57`
- Modify: `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.ts:44-57`
- Modify: `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.spec.ts`

**Interfaces:**
- Consumes: `AuditLogProps.relatedReceivableId` (Task 2). No constructor change.
- Produces: these two already write `entityType: RECEIVABLE, entityId: id` — after this task `relatedReceivableId === entityId` for every row they write, so #360's query (`WHERE relatedReceivableId = X`) is a single flat condition with no special-casing between "direct" and "indirect" audited actions.

- [ ] **Step 1: Write the failing tests**

Both spec files currently only assert `expect(auditLogRepo.create).toHaveBeenCalledTimes(1);` with no payload check. Add a payload assertion to each.

In `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.spec.ts`, replace the existing `expect(auditLogRepo.create).toHaveBeenCalledTimes(1);` line (the test's ids are `['rec-ok', 'rec-missing']`, so the one surviving write-off is for `'rec-ok'`):

```typescript
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'rec-ok', relatedReceivableId: 'rec-ok' }),
    );
```

In `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.spec.ts`, replace the same line (this test's ids are `['rec-ok', 'rec-has-payments']`):

```typescript
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'rec-ok', relatedReceivableId: 'rec-ok' }),
    );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPatterns "batch-write-off-receivable.usecase|batch-cancel-receivable.usecase"`
Expected: FAIL — `relatedReceivableId` missing from the object passed to `create`

- [ ] **Step 3: Implement**

Edit `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.ts`:

```typescript
        void this.auditLogRepo
          .create(
            new AuditLog({
              organizationId: user.organizationId,
              userId: user.userId,
              actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
              entityType: AuditEntityType.RECEIVABLE,
              entityId: id,
              relatedReceivableId: id,
              beforeState: null,
              afterState: sanitizeAuditPayload(receivable),
              ipAddress: null,
              createdAt: new Date(),
            }),
          )
```

Edit `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.ts` the same way (same insertion point, `actionType: AuditActionType.RECEIVABLE_CANCEL`):

```typescript
        void this.auditLogRepo
          .create(
            new AuditLog({
              organizationId: user.organizationId,
              userId: user.userId,
              actionType: AuditActionType.RECEIVABLE_CANCEL,
              entityType: AuditEntityType.RECEIVABLE,
              entityId: id,
              relatedReceivableId: id,
              beforeState: null,
              afterState: sanitizeAuditPayload(receivable),
              ipAddress: null,
              createdAt: new Date(),
            }),
          )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns "batch-write-off-receivable.usecase|batch-cancel-receivable.usecase"`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.ts apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.spec.ts apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.ts apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.spec.ts
git commit -m "feat: set relatedReceivableId on batch write-off/cancel audit logs"
```

---

### Task 7: e2e regression coverage — real allocation and fan-out

**Files:**
- Modify: `apps/backend/test/payment-allocation.e2e-spec.ts`
- Modify: `apps/backend/test/exception-queue.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6, against a real Postgres testcontainer (`synchronize: true` derives schema from the Task 2 ORM entity).

- [ ] **Step 1: Extend the direct-allocate e2e test**

Edit `apps/backend/test/payment-allocation.e2e-spec.ts` — add the import:

```typescript
import { AuditLogOrmEntity } from '../src/common/audit/audit-log.orm-entity';
```

In the `'partially allocates a payment and updates receivable status to PARTIALLY_PAID'` test, after the existing `expect(receivableRow[0].status).toBe('PARTIALLY_PAID');` / `expect(Number(receivableRow[0].paidAmount)).toBe(30_000_000);` assertions, add:

```typescript
    const auditRows = await dataSource.getRepository(AuditLogOrmEntity).find({
      where: { organizationId, relatedReceivableId: receivableId },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actionType).toBe('PAYMENT_ALLOCATE');
    expect(auditRows[0].entityType).toBe('PaymentAllocation');
    expect(auditRows[0].afterState).toMatchObject({
      receivableId,
      paymentId,
      allocatedAmount: 30_000_000,
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns payment-allocation.e2e-spec`

Expected: if Tasks 1–6 are already committed (executing this plan in order), this actually passes right away — Task 4's production code already exists. To genuinely observe RED first, write this step's assertions before Task 4's Step 3 implementation lands, or temporarily comment out the `if (input.allocatedByUserId) { ... }` block in `allocate-payment.usecase.ts` and confirm `auditRows` comes back empty, then restore it. State this exception in the final report per AGENTS.md's TDD exception for "verifying an already-implemented integration path."

- [ ] **Step 3: Extend the match fan-out e2e test**

Edit `apps/backend/test/exception-queue.e2e-spec.ts` — add the import:

```typescript
import { AuditLogOrmEntity } from '../src/common/audit/audit-log.orm-entity';
```

In the `'splits one transaction across receivables and leaves the remainder unallocated'` test, after the existing `payment` assertions, add:

```typescript
    const auditRowsA = await dataSource.getRepository(AuditLogOrmEntity).find({
      where: { organizationId, relatedReceivableId: receivableIdA },
    });
    const auditRowsB = await dataSource.getRepository(AuditLogOrmEntity).find({
      where: { organizationId, relatedReceivableId: receivableIdB },
    });
    expect(auditRowsA).toHaveLength(1);
    expect(auditRowsA[0].actionType).toBe('PAYMENT_ALLOCATE');
    expect(auditRowsA[0].afterState).toMatchObject({
      receivableId: receivableIdA,
      allocatedAmount: 20_000_000,
    });
    expect(auditRowsB).toHaveLength(1);
    expect(auditRowsB[0].afterState).toMatchObject({
      receivableId: receivableIdB,
      allocatedAmount: 5_000_000,
    });
```

- [ ] **Step 4: Run both e2e files to verify they pass**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns "payment-allocation.e2e-spec|exception-queue.e2e-spec"`

Expected: PASS — both files, including the 2 new assertion blocks. Requires Docker (testcontainers).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/payment-allocation.e2e-spec.ts apps/backend/test/exception-queue.e2e-spec.ts
git commit -m "test: verify relatedReceivableId on direct allocation and multi-receivable match fan-out"
```

---

## Final Verification

- [ ] **Run the full backend unit suite:** `cd apps/backend && npx jest`
- [ ] **Run the full e2e suite (needs Docker):** `pnpm --filter @casso-ar/backend test:e2e`
- [ ] **Type-check:** `cd apps/backend && npx tsc --noEmit`
- [ ] **Run `domain-check`** per AGENTS.md ("After any backend code change, run the domain-check skill and fix violations before claiming completion")
- [ ] **Run `pnpm verify`** at the repo root
- [ ] **Update `docs/wayfinder/feature-map.md`** and close issue #369, referencing the PR
