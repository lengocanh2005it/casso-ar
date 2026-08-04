# Exception Queue + Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give accountants a manual review queue for `BankTransaction` rows the Matching Engine scored 60-89 (`PENDING_REVIEW`): list them with their top `MatchingCandidate`, list all candidates for one transaction, let the accountant submit a split multi-receivable match (optimistic-locked via `BankTransaction.version`, atomic in one DB transaction), skip a transaction (`IGNORED`), or mark it as an unapplied customer prepayment (credit balance). Also add a cross-cutting `AuditLog` (INSERT-only) with a `@Audited(actionType, entityType)` decorator + global interceptor, wired onto both the new endpoints and the existing `ReceivablesController`/`PaymentsController` endpoints from prior plans.

**Architecture:** `apps/backend/src/modules/exception-queue/` owns the three write use cases (`match`/`skip`/`mark-prepaid`) and the `GET` read paths, built on top of `BankTransaction`/`MatchingCandidate` (Webhook plan) and `Receivable`/`Payment`/`PaymentAllocation` (Domain Core plan), all now behind `BaseRepository`/`TenantContextService` (Multi-tenancy plan). `apps/backend/src/common/audit/` owns `AuditLog`, is `@Global()`, and installs its interceptor via `APP_INTERCEPTOR` — controllers opt in per-handler with `@Audited(actionType, entityType)`; handlers with no decorator pay zero interceptor cost beyond one `Reflector` lookup.

**Tech Stack:** NestJS, TypeORM (`@VersionColumn` + `pessimistic_write` row lock for the match endpoint's optimistic-lock check), Jest + testcontainers/supertest for integration tests. No new npm dependencies.

## Global Constraints

- `MatchBankTransactionUseCase` opens one transaction, creates the Payment, then calls `AllocatePaymentUseCase.allocateWithinTransaction(manager, input)` for every allocation. The shared method performs all customer, remaining/unallocated, rollup, allocation and status checks; this plan must not copy that money logic.
- `BankTransaction.version` optimistic lock: `match` fetches the row with `pessimistic_write` inside its transaction, then explicitly compares `transaction.version !== input.version` — this is a manual check (not TypeORM's built-in `@VersionColumn` UPDATE-clause check), because the manual check is what the spec ("Kiểm tra ... → nếu không khớp → 409 'Giao dịch đã được xử lý'") describes and what the mandatory concurrency test (testing-strategy-design.md case 4) can assert a deterministic error message on. `@VersionColumn` still auto-increments the stored value on every `save()` as a second line of defense.
- `skip` and `mark-prepaid` do NOT take a `version` payload field (answering spec mục 4's open question): neither creates a `PaymentAllocation`, so a double-skip or double-mark-prepaid is idempotent-safe (both races end in the same terminal state, no double-spend of money) — the extra optimistic-lock plumbing would guard against a scenario with no financial consequence. `match` is the only endpoint gated by `version` because it is the only one that moves money.
- `AuditLog` is INSERT-only: `IAuditLogRepository` exposes exactly one method, `create()`, and the TypeORM implementation calls `.insert()` (never `.save()`, which can silently upsert) — there is no update/delete path to accidentally wire up later.
- `beforeState`/`afterState` are passed through `sanitizeAuditPayload()` before insert, which redacts a denylist of sensitive key names (`accessToken`, `refreshToken`, `secretKey`, `password`, `token`) recursively (answering spec mục 4's second open question). `ponytail: denylist, not allowlist — upgrade to a per-entity allowlist if a new sensitive field slips through undetected.`
- `@Audited(actionType, entityType)` takes two parameters, not one as the spec's pseudocode (`@Audited(actionType: string)`) shows — `entityType` cannot always be derived from `actionType` alone (e.g. `PAYMENT_ALLOCATE` fires from both `PaymentsController.allocate` on a `Payment` id and `ExceptionQueueController.match` on a `BankTransaction` id), so making it explicit at the call site is the simplest correct option.
- Money fields stay integer (đồng), no `float` — carried over from every prior plan's Global Constraints.
- Naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` still apply.

---

## File Structure

```
apps/backend/src/
  common/
    audit/
      audit-log.ts                              -- NEW: AuditLog domain class
      audit-log.orm-entity.ts                   -- NEW
      audit-log-repository.port.ts              -- NEW: IAuditLogRepository (create() only)
      typeorm-audit-log.repository.ts           -- NEW
      audit-action-type.enum.ts                 -- NEW
      audit-context.ts                          -- NEW: AsyncLocalStorage holder for beforeState
      audited.decorator.ts                      -- NEW: @Audited(actionType, entityType)
      audit.interceptor.ts                      -- NEW
      sanitize-audit-payload.ts                 -- NEW
      audit.module.ts                           -- NEW: @Global()
  modules/
    webhooks/
      domain/bank-transaction.ts                                    -- MODIFY: add 'IGNORED' status + markIgnored()
      application/bank-transaction-repository.port.ts                -- MODIFY: BaseRepository-shaped signatures
      infrastructure/typeorm-bank-transaction.repository.ts          -- MODIFY: extend BaseRepository
      application/matching-candidate-repository.port.ts              -- MODIFY: add findByBankTransactionId
      infrastructure/typeorm-matching-candidate.repository.ts        -- MODIFY
      webhooks.module.ts                                             -- MODIFY: export both repository tokens
    payments/
      domain/payment.ts                          -- MODIFY: add customerId field
      infrastructure/payment.orm-entity.ts       -- MODIFY
      domain/payment.spec.ts                     -- MODIFY: fixtures add customerId
      application/allocate-payment.usecase.ts    -- MODIFY: inject AuditContextService, setBefore()
      presentation/payments.controller.ts        -- MODIFY: @Audited(PAYMENT_ALLOCATE, 'Payment')
    receivables/
      application/write-off-receivable.usecase.ts        -- MODIFY: inject AuditContextService, setBefore()
      application/write-off-receivable.usecase.spec.ts   -- MODIFY: fake AuditContextService
      presentation/receivables.controller.ts              -- MODIFY: @Audited on create + write-off
    exception-queue/
      application/
        match-bank-transaction.usecase.ts
        match-bank-transaction.usecase.spec.ts
        skip-bank-transaction.usecase.ts
        skip-bank-transaction.usecase.spec.ts
        mark-prepaid-bank-transaction.usecase.ts
        mark-prepaid-bank-transaction.usecase.spec.ts
        unmatched-bank-transactions-query.service.ts
        unmatched-bank-transactions-query.service.spec.ts
      presentation/
        dto/match-bank-transaction.dto.ts
        dto/mark-prepaid-bank-transaction.dto.ts
        exception-queue.controller.ts
      exception-queue.module.ts
  modules/webhooks/application/process-webhook.usecase.ts  -- MODIFY: Payment construction carries the matched candidate customerId
  app.module.ts                                             -- MODIFY: register AuditModule, ExceptionQueueModule
test/
  exception-queue-concurrent-match.integration.spec.ts
  exception-queue-multi-allocation-match.integration.spec.ts
```

---

### Task 1: AuditLog entity + INSERT-only repository

**Files:**
- Create: `apps/backend/src/common/audit/audit-log.ts`
- Create: `apps/backend/src/common/audit/audit-log.orm-entity.ts`
- Create: `apps/backend/src/common/audit/audit-log-repository.port.ts`
- Create: `apps/backend/src/common/audit/typeorm-audit-log.repository.ts`
- Create: `apps/backend/src/common/audit/audit-action-type.enum.ts`
- Create: `apps/backend/src/common/audit/sanitize-audit-payload.ts`
- Test: `apps/backend/src/common/audit/sanitize-audit-payload.spec.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `AuditLog` domain class, `IAuditLogRepository.create()`, `AuditActionType` enum, `sanitizeAuditPayload()` — used by Task 2's `AuditInterceptor`

- [ ] **Step 1: Create `apps/backend/src/common/audit/audit-action-type.enum.ts`**

```typescript
export enum AuditActionType {
  RECEIVABLE_CREATE = 'RECEIVABLE_CREATE',
  RECEIVABLE_UPDATE = 'RECEIVABLE_UPDATE',
  RECEIVABLE_WRITE_OFF = 'RECEIVABLE_WRITE_OFF',
  RECEIVABLE_CANCEL = 'RECEIVABLE_CANCEL',
  RECEIVABLE_DISPUTE = 'RECEIVABLE_DISPUTE',
  PAYMENT_ALLOCATE = 'PAYMENT_ALLOCATE',
  PAYMENT_ALLOCATE_UNDO = 'PAYMENT_ALLOCATE_UNDO',
  REMINDER_POLICY_UPDATE = 'REMINDER_POLICY_UPDATE',
  BANK_CONNECTION_CREATE = 'BANK_CONNECTION_CREATE',
  BANK_CONNECTION_DISCONNECT = 'BANK_CONNECTION_DISCONNECT',
  SUBSCRIPTION_CHANGE_PLAN = 'SUBSCRIPTION_CHANGE_PLAN',
  BANK_TRANSACTION_SKIP = 'BANK_TRANSACTION_SKIP',
  BANK_TRANSACTION_MARK_PREPAID = 'BANK_TRANSACTION_MARK_PREPAID',
}
```

The first 11 values are the mandatory list from spec mục 2 ("tài liệu gốc mục 15"). `BANK_TRANSACTION_SKIP`/`BANK_TRANSACTION_MARK_PREPAID` are added here because spec mục 1 explicitly requires `skip` to write an `AuditLog` even though it isn't in the mandatory-list table; `mark-prepaid` gets the same treatment for consistency (both mutate a `BankTransaction`'s disposition without an allocation).

- [ ] **Step 2: Create `apps/backend/src/common/audit/audit-log.ts`**

```typescript
export interface AuditLogProps {
  id: string;
  organizationId: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export class AuditLog {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly actionType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly beforeState: Record<string, unknown> | null;
  readonly afterState: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;

  constructor(props: AuditLogProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.actionType = props.actionType;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.beforeState = props.beforeState;
    this.afterState = props.afterState;
    this.ipAddress = props.ipAddress;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 3: Create `apps/backend/src/common/audit/audit-log.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_logs' })
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  userId: string;

  @Column()
  actionType: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column()
  createdAt: Date;
}
```

No `updatedAt`/`deletedAt` columns and no soft-delete decorator — this table is never mutated after insert (spec mục 2: "không có endpoint PATCH/DELETE").

- [ ] **Step 4: Create `apps/backend/src/common/audit/audit-log-repository.port.ts`**

```typescript
import { AuditLog } from './audit-log';
import { EntityManager } from 'typeorm';

export interface IAuditLogRepository {
  create(log: AuditLog, manager?: EntityManager): Promise<void>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
```

Deliberately one method — there is no `update`/`delete` to forget to leave unimplemented.

- [ ] **Step 5: Create `apps/backend/src/common/audit/typeorm-audit-log.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './audit-log';
import { IAuditLogRepository } from './audit-log-repository.port';
import { AuditLogOrmEntity } from './audit-log.orm-entity';

@Injectable()
export class TypeOrmAuditLogRepository implements IAuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repo: Repository<AuditLogOrmEntity>,
  ) {}

  async create(log: AuditLog, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLogOrmEntity) : this.repo;
    await repo.insert(log as unknown as AuditLogOrmEntity);
  }
}
```

`.insert()` (not `.save()`) is a deliberate choice — `.save()` can upsert on a matching primary key, `.insert()` can only INSERT.

- [ ] **Step 6: Write failing test for `sanitizeAuditPayload`**

Create `apps/backend/src/common/audit/sanitize-audit-payload.spec.ts`:

```typescript
import { sanitizeAuditPayload } from './sanitize-audit-payload';

describe('sanitizeAuditPayload', () => {
  it('redacts known sensitive keys at any nesting depth', () => {
    const result = sanitizeAuditPayload({
      id: 'conn-1',
      accessToken: 'super-secret-token',
      nested: { secretKey: 'also-secret', ok: 'fine' },
    });

    expect(result).toEqual({
      id: 'conn-1',
      accessToken: '[REDACTED]',
      nested: { secretKey: '[REDACTED]', ok: 'fine' },
    });
  });

  it('returns null for null, undefined, or primitive input', () => {
    expect(sanitizeAuditPayload(null)).toBeNull();
    expect(sanitizeAuditPayload(undefined)).toBeNull();
    expect(sanitizeAuditPayload('a string')).toBeNull();
  });

  it('passes through objects with no sensitive keys unchanged', () => {
    expect(sanitizeAuditPayload({ id: 'rec-1', status: 'PAID' })).toEqual({
      id: 'rec-1',
      status: 'PAID',
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test sanitize-audit-payload.spec.ts`
Expected: FAIL — Cannot find module './sanitize-audit-payload'

- [ ] **Step 8: Create `apps/backend/src/common/audit/sanitize-audit-payload.ts`**

```typescript
const SENSITIVE_KEYS = new Set(['accessToken', 'refreshToken', 'secretKey', 'password', 'token']);

// ponytail: denylist of known-sensitive key names, not a per-entity allowlist —
// upgrade to an allowlist (or a per-entity redaction map) if a new sensitive
// field is added to some entity and forgotten here.
export function sanitizeAuditPayload(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null;
  }
  return JSON.parse(
    JSON.stringify(value),
    (key: string, val: unknown) => (SENSITIVE_KEYS.has(key) ? '[REDACTED]' : val),
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test sanitize-audit-payload.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/common/audit
git commit -m "feat: add AuditLog entity, insert-only repository, and payload sanitizer"
```

---

### Task 2: AuditContextService + @Audited decorator + AuditInterceptor

**Files:**
- Create: `apps/backend/src/common/audit/audit-context.ts`
- Create: `apps/backend/src/common/audit/audited.decorator.ts`
- Create: `apps/backend/src/common/audit/audit.interceptor.ts`
- Create: `apps/backend/src/common/audit/audit.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/common/audit/audit.interceptor.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService` (Multi-tenancy plan), `IAuditLogRepository` (Task 1)
- Produces: `@Audited(actionType, entityType)`, `AuditContextService.setBefore()` — used by Task 3 and by Task 6/7's Exception Queue use cases

- [ ] **Step 1: Create `apps/backend/src/common/audit/audit-context.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface AuditStore {
  before: unknown;
  after: unknown;
}

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditStore>();

  run<T>(callback: () => T): T {
    return this.storage.run({ before: null, after: null }, callback);
  }

  setBefore(entity: unknown): void {
    const store = this.storage.getStore();
    if (store) {
      store.before = entity;
    }
  }

  getBefore(): unknown {
    return this.storage.getStore()?.before ?? null;
  }

  setAfter(entity: unknown): void {
    const store = this.storage.getStore();
    if (store) {
      store.after = entity;
    }
  }

  getAfter(): unknown {
    return this.storage.getStore()?.after ?? null;
  }
}
```

Mirrors `TenantContextService`'s `AsyncLocalStorage` pattern (Multi-tenancy plan, Task 3) — service code deep in a call stack calls `setBefore(entity)` right after loading the record it will mutate; the interceptor calls `setAfter(response)` only after the handler succeeds, then persists both snapshots.

- [ ] **Step 2: Create `apps/backend/src/common/audit/audited.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { AuditActionType } from './audit-action-type.enum';

export const AUDITED_METADATA_KEY = 'auditedMetadata';

export interface AuditedMetadata {
  actionType: AuditActionType;
  entityType: string;
}

export const Audited = (actionType: AuditActionType, entityType: string) =>
  SetMetadata(AUDITED_METADATA_KEY, { actionType, entityType } as AuditedMetadata);
```

- [ ] **Step 3: Write failing test for `AuditInterceptor`**

Create `apps/backend/src/common/audit/audit.interceptor.spec.ts`:

```typescript
import { of, throwError, lastValueFrom } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { AuditActionType } from './audit-action-type.enum';
import { AuditContextService } from './audit-context';

function buildContext(params: Record<string, string>, ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params, ip }) }),
    getHandler: () => {},
    getClass: () => {},
  } as unknown as ExecutionContext;
}

describe('AuditInterceptor', () => {
  it('writes an AuditLog after the handler succeeds, when @Audited metadata is present', async () => {
    const reflector = {
      getAllAndOverride: () => ({ actionType: AuditActionType.RECEIVABLE_WRITE_OFF, entityType: 'Receivable' }),
    } as unknown as Reflector;
    const auditContext = new AuditContextService();
    const tenantContext = { getCurrentUser: () => ({ userId: 'u1', organizationId: 'org-1', role: 'OWNER' }) };
    const auditLogRepo = { create: jest.fn() };

    const interceptor = new AuditInterceptor(reflector, auditContext, tenantContext as any, auditLogRepo as any);
    const context = buildContext({ id: 'rec-1' }, '127.0.0.1');
    const handler: CallHandler = {
      handle: () => {
        auditContext.setBefore({ id: 'rec-1', status: 'OPEN' });
        return of({ id: 'rec-1', status: 'WRITTEN_OFF' });
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'u1',
        actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
        entityType: 'Receivable',
        entityId: 'rec-1',
        beforeState: { id: 'rec-1', status: 'OPEN' },
        afterState: { id: 'rec-1', status: 'WRITTEN_OFF' },
      }),
    );
  });

  it('does not write an AuditLog when the handler throws', async () => {
    const reflector = {
      getAllAndOverride: () => ({ actionType: AuditActionType.RECEIVABLE_WRITE_OFF, entityType: 'Receivable' }),
    } as unknown as Reflector;
    const auditContext = new AuditContextService();
    const tenantContext = { getCurrentUser: () => ({ userId: 'u1', organizationId: 'org-1', role: 'OWNER' }) };
    const auditLogRepo = { create: jest.fn() };

    const interceptor = new AuditInterceptor(reflector, auditContext, tenantContext as any, auditLogRepo as any);
    const context = buildContext({ id: 'rec-1' }, '127.0.0.1');
    const handler: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow('boom');
    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });

  it('skips entirely when no @Audited metadata is set on the handler', async () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const auditContext = new AuditContextService();
    const tenantContext = { getCurrentUser: jest.fn() };
    const auditLogRepo = { create: jest.fn() };

    const interceptor = new AuditInterceptor(reflector, auditContext, tenantContext as any, auditLogRepo as any);
    const context = buildContext({}, '127.0.0.1');
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(auditLogRepo.create).not.toHaveBeenCalled();
    expect(tenantContext.getCurrentUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test audit.interceptor.spec.ts`
Expected: FAIL — Cannot find module './audit.interceptor'

- [ ] **Step 5: Create `apps/backend/src/common/audit/audit.interceptor.ts`**

```typescript
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { AUDITED_METADATA_KEY, AuditedMetadata } from './audited.decorator';
import { AuditContextService } from './audit-context';
import { IAuditLogRepository, AUDIT_LOG_REPOSITORY } from './audit-log-repository.port';
import { AuditLog } from './audit-log';
import { TenantContextService } from '../tenancy/tenant-context';
import { sanitizeAuditPayload } from './sanitize-audit-payload';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditContext: AuditContextService,
    private readonly tenantContext: TenantContextService,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepo: IAuditLogRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditedMetadata | undefined>(AUDITED_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    let result$!: Observable<unknown>;
    this.auditContext.run(() => {
      result$ = next.handle().pipe(
        tap((response: unknown) => {
          const user = this.tenantContext.getCurrentUser();
          if (!user) {
            return;
          }

          this.auditContext.setAfter(response);
          const entityId = request.params?.id ?? (response as { id?: string } | undefined)?.id ?? '';

          // ponytail: fire-and-forget insert — the audit write never blocks or fails
          // the HTTP response. Upgrade to an awaited write (and surface failures) if
          // "audit log write failed silently" becomes an observed incident.
          void this.auditLogRepo.create(
            new AuditLog({
              id: randomUUID(),
              organizationId: user.organizationId,
              userId: user.userId,
              actionType: metadata.actionType,
              entityType: metadata.entityType,
              entityId,
              beforeState: sanitizeAuditPayload(this.auditContext.getBefore()),
              afterState: sanitizeAuditPayload(this.auditContext.getAfter()),
              ipAddress: request.ip ?? null,
              createdAt: new Date(),
            }),
          );
        }),
      );
    });
    return result$;
  }
}
```

`tap()`'s success callback only runs when the source observable emits a value, not when it errors — this is the mechanism satisfying spec mục 2's "Nếu handler throw → không ghi log."

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test audit.interceptor.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 7: Create `apps/backend/src/common/audit/audit.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogOrmEntity } from './audit-log.orm-entity';
import { TypeOrmAuditLogRepository } from './typeorm-audit-log.repository';
import { AUDIT_LOG_REPOSITORY } from './audit-log-repository.port';
import { AuditContextService } from './audit-context';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogOrmEntity])],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: TypeOrmAuditLogRepository },
    AuditContextService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AUDIT_LOG_REPOSITORY, AuditContextService],
})
export class AuditModule {}
```

`@Global()` so `AuditContextService` is injectable from any module (`WriteOffReceivableUseCase`, `AllocatePaymentUseCase`, `MatchBankTransactionUseCase`, ...) without every module importing `AuditModule` explicitly — same pattern as `TenancyModule` (Multi-tenancy plan, Task 5).

- [ ] **Step 8: Register `AuditModule` in `apps/backend/src/app.module.ts`**

Add `AuditModule` to `imports` (import from `./common/audit/audit.module`).

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/common/audit apps/backend/src/app.module.ts
git commit -m "feat: add AuditContextService, @Audited decorator, and global AuditInterceptor"
```

---

### Task 3: Apply @Audited to existing Receivables/Payments endpoints

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/presentation/payments.controller.ts`

**Interfaces:**
- Consumes: `@Audited` (Task 2), `AuditContextService` (Task 2)
- Produces: `RECEIVABLE_CREATE`, `RECEIVABLE_WRITE_OFF`, `PAYMENT_ALLOCATE` audit coverage on the 3 endpoints that already exist from the Domain Core and Multi-tenancy plans

- [ ] **Step 1: Inject `AuditContextService` into `WriteOffReceivableUseCase` and call `setBefore`**

Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { AuditContextService } from '../../../common/audit/audit-context';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class WriteOffReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    const receivable = await this.receivableRepo.findById(receivableId);
    if (!receivable) {
      throw new Error('Receivable not found');
    }
    this.auditContext.setBefore(receivable);
    const updated = receivable.writeOff();
    await this.receivableRepo.save(updated);
    return updated;
  }
}
```

- [ ] **Step 2: Update the existing unit test's constructor call**

Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts` — construct with a fake `AuditContextService` as the second argument in both test cases:

```typescript
const auditContext = {
  setBefore: jest.fn(),
  getBefore: jest.fn(),
  setAfter: jest.fn(),
  getAfter: jest.fn(),
  run: (cb: () => unknown) => cb(),
};
const tenantContext = { getOrganizationId: () => 'org-1' };
const eventEmitter = { emit: jest.fn() };
const useCase = new WriteOffReceivableUseCase(
  receivableRepo as any,
  tenantContext as any,
  eventEmitter as any,
  auditContext as any,
);
```

- [ ] **Step 3: Run test to verify it still passes**

Run: `pnpm --filter @casso-ledger/backend test write-off-receivable.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 4: Apply `@Audited` to `ReceivablesController`**

Apply the following additions to the controller produced by Domain Core, Dispute Management, and the later Testing Strategy plan. **Do not replace the whole file:** preserve its existing `GET /:id`, dispute, write-off, create, and cancel routes; add the imports/guards/decorators shown below to the corresponding handlers.

```typescript
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { Audited } from '../../../common/audit/audited.decorator';
import { AuditActionType } from '../../../common/audit/audit-action-type.enum';

@Controller('receivables')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  @Audited(AuditActionType.RECEIVABLE_CREATE, 'Receivable')
  async create(@Body() dto: CreateReceivableDto) {
    return this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId,
    });
  }

  @Post(':id/write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  @Audited(AuditActionType.RECEIVABLE_WRITE_OFF, 'Receivable')
  async writeOff(@Param('id') id: string) {
    return this.writeOffReceivableUseCase.execute(id);
  }
}
```

- [ ] **Step 5: Add audit capture to the existing shared allocation use case**

Modify the `AllocatePaymentUseCase` created by the Domain Core plan. Keep its public `execute()` and internal `allocateWithinTransaction(manager, input)` paths intact; do not reintroduce a second allocation implementation or inject `PaymentAllocation` repositories directly into this plan. Add `AuditContextService` to the constructor and call `setBefore({ payment, receivable })` after the two locked reads. Record the updated payment/receivable through the existing audit-context completion hook after the shared allocation succeeds. The transaction, customer invariant, persisted rollups, allocation insert, and post-commit events remain owned by Domain Core.

```typescript
import { AuditContextService } from '../../../common/audit/audit-context';
// Existing constructor dependencies from Collection Activity remain; append this one dependency.
constructor(/* receivableRepo, paymentRepo, allocationRepo, dataSource, tenantContext, eventEmitter */, private readonly auditContext: AuditContextService) {}

// Inside execute()/allocateWithinTransaction(), after locked reads:
this.auditContext.setBefore({ payment, receivable });
// After the shared allocation succeeds:
this.auditContext.setAfter({ payment: updatedPayment, receivable: updatedReceivable });
```

- [ ] **Step 6: Update the existing unit test's constructor call**

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts` — add a fake `AuditContextService` as the 7th constructor argument, after the existing `EventEmitter2`, in both test cases:

```typescript
const auditContext = {
  setBefore: jest.fn(),
  getBefore: jest.fn(),
  setAfter: jest.fn(),
  getAfter: jest.fn(),
  run: (cb: () => unknown) => cb(),
};
const useCase = new AllocatePaymentUseCase(
  receivableRepo as any,
  paymentRepo as any,
  allocationRepo as any,
  dataSource as any,
  tenantContext as any,
  eventEmitter as any,
  auditContext as any,
);
```

- [ ] **Step 7: Apply `@Audited` to `PaymentsController.allocate`**

Apply the following additions to the Domain Core controller. **Do not replace the whole file:** preserve its existing `POST /allocations/:allocationId/undo` route and add audit/permission/actor handling only to `allocate`.

```typescript
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Audited } from '../../../common/audit/audited.decorator';
import { AuditActionType } from '../../../common/audit/audit-action-type.enum';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PaymentsController {
  constructor(private readonly allocatePaymentUseCase: AllocatePaymentUseCase) {}

  @Post(':id/allocate')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(AuditActionType.PAYMENT_ALLOCATE, 'Payment')
  async allocate(@Param('id') paymentId: string, @Body() dto: AllocatePaymentDto, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    await this.allocatePaymentUseCase.execute({
      paymentId,
      receivableId: dto.receivableId,
      amount: dto.amount,
      allocatedByUserId: user.userId,
    });
    return { success: true };
  }
}
```

(`paymentId` added to the response body so `AuditInterceptor`'s `response?.id` fallback isn't needed here — `request.params.id` already resolves it, this is just for API caller convenience.)

- [ ] **Step 8: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/receivables apps/backend/src/modules/payments
git commit -m "feat: apply @Audited to existing receivable and payment allocation endpoints"
```

---

### Task 4: Migrate BankTransaction + MatchingCandidate repositories, add IGNORED status

**Files:**
- Modify: `apps/backend/src/modules/webhooks/domain/bank-transaction.ts`
- Modify: `apps/backend/src/modules/webhooks/domain/bank-transaction.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/application/bank-transaction-repository.port.ts`
- Modify: `apps/backend/src/modules/webhooks/infrastructure/typeorm-bank-transaction.repository.ts`
- Modify: `apps/backend/src/modules/webhooks/application/matching-candidate-repository.port.ts`
- Modify: `apps/backend/src/modules/webhooks/infrastructure/typeorm-matching-candidate.repository.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`

**Interfaces:**
- Consumes: `BaseRepository`/`TenantContextService` (Multi-tenancy plan)
- Produces: `IBankTransactionRepository.findByIdForUpdate(id, manager)` / `.findManyByStatus(status)`, `IMatchingCandidateRepository.findByBankTransactionId(bankTransactionId)` — used by Tasks 6-8

`BankTransaction`/`MatchingCandidate` were deliberately NOT behind `BaseRepository` in the Webhook plan because the queue processor runs before any HTTP request/JWT exists. That processor already opens a `TenantContextService.run({...}, callback)` scope manually (Webhook plan, Task 9) before touching any repository — so migrating onto `BaseRepository` here does not break it; it makes the Exception Queue's own HTTP endpoints (which DO run inside an authenticated request) consistent with every other repository in the codebase.

`BankTransaction.version` remains TypeORM `@VersionColumn()`: the match endpoint compares the loaded version while holding its row lock, and the successful `save()` is the single persistence boundary that increments it. Domain transition helpers (`markMatched`, `markIgnored`, etc.) preserve the loaded version so they do not double-increment it; tests must assert the version sent to the lock check and the persisted version after the integration save.

- [ ] **Step 1: Write failing test for `BankTransaction.markIgnored`**

Modify `apps/backend/src/modules/webhooks/domain/bank-transaction.spec.ts` — add:

```typescript
it('markIgnored transitions status to IGNORED', () => {
  const updated = buildTransaction().markIgnored();
  expect(updated.status).toBe('IGNORED');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test bank-transaction.spec.ts`
Expected: FAIL — `buildTransaction().markIgnored is not a function`

- [ ] **Step 3: Add `IGNORED` status and `markIgnored()` to `BankTransaction`**

Modify `apps/backend/src/modules/webhooks/domain/bank-transaction.ts`:

```typescript
export type BankTransactionStatus = 'UNMATCHED' | 'PENDING_REVIEW' | 'MATCHED' | 'IGNORED';
```

Add the method alongside `markMatched`/`markPendingReview`/`markUnmatched`:

```typescript
  markIgnored(): BankTransaction {
    return new BankTransaction({ ...this, status: 'IGNORED' });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test bank-transaction.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Migrate `IBankTransactionRepository` port**

Replace `apps/backend/src/modules/webhooks/application/bank-transaction-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { BankTransaction, BankTransactionStatus } from '../domain/bank-transaction';

export interface IBankTransactionRepository {
  save(transaction: BankTransaction, manager?: EntityManager): Promise<void>;
  findById(id: string): Promise<BankTransaction | null>;
  findByIdForUpdate(id: string, manager: EntityManager): Promise<BankTransaction | null>;
  findManyByStatus(status: BankTransactionStatus): Promise<BankTransaction[]>;
  countByStatus(status: BankTransactionStatus): Promise<number>;
}

export const BANK_TRANSACTION_REPOSITORY = Symbol('BANK_TRANSACTION_REPOSITORY');
```

- [ ] **Step 6: Migrate `TypeOrmBankTransactionRepository`**

Replace `apps/backend/src/modules/webhooks/infrastructure/typeorm-bank-transaction.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BankTransaction, BankTransactionStatus } from '../domain/bank-transaction';
import { IBankTransactionRepository } from '../application/bank-transaction-repository.port';
import { BankTransactionOrmEntity } from './bank-transaction.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmBankTransactionRepository
  extends BaseRepository<BankTransactionOrmEntity>
  implements IBankTransactionRepository
{
  constructor(
    @InjectRepository(BankTransactionOrmEntity) repo: Repository<BankTransactionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<BankTransaction | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new BankTransaction(row) : null;
  }

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<BankTransaction | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(BankTransactionOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new BankTransaction(row) : null;
  }

  async findManyByStatus(status: BankTransactionStatus): Promise<BankTransaction[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({ where: { organizationId, status } as any });
    return rows.map((row) => new BankTransaction(row));
  }

  async countByStatus(status: BankTransactionStatus): Promise<number> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.count({ where: { organizationId, status } as any });
  }

  async save(transaction: BankTransaction, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager ? manager.getRepository(BankTransactionOrmEntity) : this.ormRepo;
    await repo.save({ ...transaction, organizationId } as BankTransactionOrmEntity);
  }
}
```

- [ ] **Step 7: Add `findByBankTransactionId` to `IMatchingCandidateRepository` port**

Replace `apps/backend/src/modules/webhooks/application/matching-candidate-repository.port.ts`:

```typescript
import { MatchingCandidate } from '../domain/matching-candidate';

export interface IMatchingCandidateRepository {
  saveMany(candidates: MatchingCandidate[]): Promise<void>;
  findByBankTransactionId(bankTransactionId: string): Promise<MatchingCandidate[]>;
}

export const MATCHING_CANDIDATE_REPOSITORY = Symbol('MATCHING_CANDIDATE_REPOSITORY');
```

- [ ] **Step 8: Implement `findByBankTransactionId`**

Modify `apps/backend/src/modules/webhooks/infrastructure/typeorm-matching-candidate.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchingCandidate } from '../domain/matching-candidate';
import { IMatchingCandidateRepository } from '../application/matching-candidate-repository.port';
import { MatchingCandidateOrmEntity } from './matching-candidate.orm-entity';

@Injectable()
export class TypeOrmMatchingCandidateRepository implements IMatchingCandidateRepository {
  constructor(
    @InjectRepository(MatchingCandidateOrmEntity)
    private readonly repo: Repository<MatchingCandidateOrmEntity>,
  ) {}

  async saveMany(candidates: MatchingCandidate[]): Promise<void> {
    await this.repo.save(candidates as unknown as MatchingCandidateOrmEntity[]);
  }

  async findByBankTransactionId(bankTransactionId: string): Promise<MatchingCandidate[]> {
    const rows = await this.repo.find({
      where: { bankTransactionId },
      order: { totalScore: 'DESC' },
    });
    return rows.map((row) => new MatchingCandidate(row));
  }
}
```

`MatchingCandidateOrmEntity` carries no `organizationId` column (Webhook plan, Task 8) so it stays a plain `Repository`, not `BaseRepository` — every caller reaches it only after already confirming the parent `BankTransaction` belongs to the caller's tenant (Task 8 of this plan enforces that ordering).

- [ ] **Step 9: Export both repository tokens from `webhooks.module.ts`**

Modify `apps/backend/src/modules/webhooks/webhooks.module.ts` — add an `exports` array:

```typescript
  exports: [BANK_TRANSACTION_REPOSITORY, MATCHING_CANDIDATE_REPOSITORY],
```

(with the corresponding imports for both tokens already present in the file from earlier tasks).

- [ ] **Step 10: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/webhooks
git commit -m "refactor: migrate BankTransaction repository to BaseRepository, add IGNORED status and candidate lookup"
```

---

### Task 5: Add customerId to Payment (for mark-prepaid credit balances)

**Files:**
- Modify: `apps/backend/src/modules/payments/domain/payment.ts`
- Modify: `apps/backend/src/modules/payments/domain/payment.spec.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/payment.orm-entity.ts`
- Modify: `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `Payment.customerId: string | null` — used by Task 7's `MarkPrepaidBankTransactionUseCase` to attribute an unallocated credit balance to a customer before any `Receivable` exists to allocate it against

Spec mục 1's `mark-prepaid` route is described as "gán customerId, giữ làm credit balance (Payment chưa allocate)" — `Payment` (Domain Core plan) has no customer attribution today because every existing caller allocates immediately against a known `Receivable`. `mark-prepaid` is the one flow that creates a `Payment` with zero allocations, so it is the one flow that needs to record whose money it is.

- [ ] **Step 1: Add `customerId` to `Payment`**

Modify `apps/backend/src/modules/payments/domain/payment.ts`:

```typescript
export interface PaymentProps {
  id: string;
  organizationId: string;
  bankTransactionId: string | null;
  customerId: string | null;
  totalAmount: number;
  allocatedAmount: number;
  payerName: string;
  receivedAt: Date;
  createdAt: Date;
}

export class Payment {
  readonly id: string;
  readonly organizationId: string;
  readonly bankTransactionId: string | null;
  readonly customerId: string | null;
  readonly totalAmount: number;
  readonly allocatedAmount: number;
  readonly payerName: string;
  readonly receivedAt: Date;
  readonly createdAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.bankTransactionId = props.bankTransactionId;
    this.customerId = props.customerId;
    this.totalAmount = props.totalAmount;
    this.allocatedAmount = props.allocatedAmount;
    this.payerName = props.payerName;
    this.receivedAt = props.receivedAt;
    this.createdAt = props.createdAt;
  }

  get unallocatedAmount(): number {
    return this.totalAmount - this.allocatedAmount;
  }

  withAdditionalAllocation(amount: number): Payment {
    if (amount > this.unallocatedAmount) {
      throw new Error('Allocation amount exceeds unallocated payment amount');
    }
    return new Payment({ ...this, allocatedAmount: this.allocatedAmount + amount });
  }
}
```

- [ ] **Step 2: Update `payment.spec.ts` fixtures**

Modify `apps/backend/src/modules/payments/domain/payment.spec.ts` — add `customerId: null` to the `Payment` constructor call in the existing test.

- [ ] **Step 3: Run test to verify it still passes**

Run: `pnpm --filter @casso-ledger/backend test payment.spec.ts`
Expected: PASS

- [ ] **Step 4: Add `customerId` column to `PaymentOrmEntity`**

Modify `apps/backend/src/modules/payments/infrastructure/payment.orm-entity.ts` — add:

```typescript
  @Column({ nullable: true })
  customerId: string | null;
```

- [ ] **Step 5: Fix the one other `Payment` construction site**

Modify `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts` — keep the matched candidate's `customerId` on the `new Payment({...})` call in the auto-match branch; never set it to `null` after matching.

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payments apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts
git commit -m "feat: add customerId to Payment for unallocated credit balance attribution"
```

---

### Task 6: MatchBankTransactionUseCase (multi-allocation, optimistic lock)

**Files:**
- Create: `apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.ts`
- Test: `apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankTransactionRepository` (Task 4), `IReceivableRepository`/`IPaymentRepository`, shared `AllocatePaymentUseCase` (Domain Core + Multi-tenancy plans), `TenantContextService`, `AuditContextService`
- Produces: `MatchBankTransactionUseCase.execute(input): Promise<BankTransaction>` — used by Task 8's controller

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.spec.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { Receivable } from '../../receivables/domain/receivable';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { MatchBankTransactionUseCase } from './match-bank-transaction.usecase';

function buildTransaction(overrides: Partial<{ version: number; status: string; amount: number }> = {}): BankTransaction {
  return new BankTransaction({
    id: 'bt-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'wh-1',
    providerTransactionId: 'TX-001',
    amount: overrides.amount ?? 30_000_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'CONG TY B',
    transferContent: 'TT HD INV-2026-0012',
    status: (overrides.status as any) ?? 'PENDING_REVIEW',
    version: overrides.version ?? 1,
    createdAt: new Date('2026-08-01'),
  });
}

function buildReceivable(id: string, remaining: number): Receivable {
  return new Receivable({
    id,
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: remaining,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
  });
}

function buildUseCase(overrides: {
  transaction?: BankTransaction | null;
  receivables?: Record<string, Receivable | null>;
}) {
  const bankTransactionRepo = {
    findByIdForUpdate: jest.fn().mockResolvedValue(overrides.transaction ?? buildTransaction()),
    save: jest.fn(),
    findById: jest.fn(),
    findManyByStatus: jest.fn(),
  };
  const receivableRepo = {
    findByIdForUpdate: jest.fn((id: string) => Promise.resolve(overrides.receivables?.[id] ?? null)),
    save: jest.fn(),
    findById: jest.fn(),
  };
  const paymentRepo = { save: jest.fn(), findByIdForUpdate: jest.fn() };
  const allocatePaymentUseCase = { allocateWithinTransaction: jest.fn() };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb({} as EntityManager)),
  };
  const tenantContext = { getOrganizationId: () => 'org-1' };
  const auditContext = {
    setBefore: jest.fn(),
    getBefore: jest.fn(),
    setAfter: jest.fn(),
    getAfter: jest.fn(),
    run: (cb: () => unknown) => cb(),
  };

  const useCase = new MatchBankTransactionUseCase(
    bankTransactionRepo as any,
    receivableRepo as any,
    paymentRepo as any,
    allocatePaymentUseCase as any,
    dataSource as any,
    tenantContext as any,
    auditContext as any,
  );

  return { useCase, bankTransactionRepo, receivableRepo, paymentRepo, allocatePaymentUseCase };
}

describe('MatchBankTransactionUseCase', () => {
  it('throws ConflictException when the version does not match (concurrent match)', async () => {
    const { useCase } = buildUseCase({ transaction: buildTransaction({ version: 2 }) });

    await expect(
      useCase.execute({
        bankTransactionId: 'bt-1',
        allocations: [{ receivableId: 'rec-1', amount: 30_000_000 }],
        version: 1,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when the transaction is no longer PENDING_REVIEW', async () => {
    const { useCase } = buildUseCase({ transaction: buildTransaction({ status: 'MATCHED' }) });

    await expect(
      useCase.execute({
        bankTransactionId: 'bt-1',
        allocations: [{ receivableId: 'rec-1', amount: 30_000_000 }],
        version: 1,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException when the sum of allocations exceeds the transaction amount', async () => {
    const { useCase } = buildUseCase({
      transaction: buildTransaction({ amount: 20_000_000 }),
      receivables: { 'rec-1': buildReceivable('rec-1', 30_000_000) },
    });

    await expect(
      useCase.execute({
        bankTransactionId: 'bt-1',
        allocations: [{ receivableId: 'rec-1', amount: 25_000_000 }],
        version: 1,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when a receivable in the allocation list does not exist', async () => {
    const { useCase } = buildUseCase({ receivables: {} });

    await expect(
      useCase.execute({
        bankTransactionId: 'bt-1',
        allocations: [{ receivableId: 'missing', amount: 10_000_000 }],
        version: 1,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates one PaymentAllocation per allocation and marks the transaction MATCHED, leaving the leftover unallocated', async () => {
    const { useCase, bankTransactionRepo, receivableRepo, paymentRepo, allocatePaymentUseCase } = buildUseCase({
      transaction: buildTransaction({ amount: 30_000_000 }),
      receivables: {
        'rec-1': buildReceivable('rec-1', 20_000_000),
        'rec-2': buildReceivable('rec-2', 10_000_000),
      },
    });

    const result = await useCase.execute({
      bankTransactionId: 'bt-1',
      allocations: [
        { receivableId: 'rec-1', amount: 15_000_000 },
        { receivableId: 'rec-2', amount: 10_000_000 },
      ],
      version: 1,
      allocatedByUserId: 'user-1',
    });

    expect(allocatePaymentUseCase.allocateWithinTransaction).toHaveBeenCalledTimes(2);
    expect(allocatePaymentUseCase.allocateWithinTransaction).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ receivableId: 'rec-1', amount: 15_000_000 }),
    );
    expect(allocatePaymentUseCase.allocateWithinTransaction).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ receivableId: 'rec-2', amount: 10_000_000 }),
    );
    expect(bankTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'MATCHED' }),
      expect.anything(),
    );
    expect(result.status).toBe('MATCHED');

    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', allocatedAmount: 0 }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test match-bank-transaction.usecase.spec.ts`
Expected: FAIL — Cannot find module './match-bank-transaction.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.ts`**

```typescript
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  IBankTransactionRepository,
  BANK_TRANSACTION_REPOSITORY,
} from '../../webhooks/application/bank-transaction-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from '../../payments/application/payment-repository.port';
import { Payment } from '../../payments/domain/payment';
import { AllocatePaymentUseCase } from '../../payments/application/allocate-payment.usecase';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { AuditContextService } from '../../../common/audit/audit-context';

export interface MatchAllocationItem {
  receivableId: string;
  amount: number;
}

export interface MatchBankTransactionInput {
  bankTransactionId: string;
  allocations: MatchAllocationItem[];
  version: number;
  allocatedByUserId: string;
}

@Injectable()
export class MatchBankTransactionUseCase {
  constructor(
    @Inject(BANK_TRANSACTION_REPOSITORY) private readonly bankTransactionRepo: IBankTransactionRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(input: MatchBankTransactionInput): Promise<BankTransaction> {
    const organizationId = this.tenantContext.getOrganizationId();

    return this.dataSource.transaction(async (manager) => {
      const transaction = await this.bankTransactionRepo.findByIdForUpdate(input.bankTransactionId, manager);
      if (!transaction) {
        throw new NotFoundException('Bank transaction not found');
      }

      this.auditContext.setBefore(transaction);

      if (transaction.version !== input.version || transaction.status !== 'PENDING_REVIEW') {
        throw new ConflictException('Giao dịch đã được xử lý');
      }

      const sumAllocations = input.allocations.reduce((total, item) => total + item.amount, 0);
      if (input.allocations.length === 0) {
        throw new BadRequestException('At least one allocation is required');
      }
      if (sumAllocations > transaction.amount) {
        throw new BadRequestException('Total allocation amount exceeds the transaction amount');
      }

      const firstReceivable = await this.receivableRepo.findByIdForUpdate(
        input.allocations[0].receivableId,
        manager,
      );
      if (!firstReceivable) {
        throw new NotFoundException(`Receivable ${input.allocations[0].receivableId} not found`);
      }

      const payment = new Payment({
        id: randomUUID(),
        organizationId,
        bankTransactionId: transaction.id,
        customerId: firstReceivable.customerId,
        totalAmount: transaction.amount,
        allocatedAmount: 0,
        payerName: transaction.counterpartyName,
        receivedAt: transaction.transactionDateTime,
        createdAt: new Date(),
      });
      await this.paymentRepo.save(payment, manager);

      for (const item of input.allocations) {
        await this.allocatePaymentUseCase.allocateWithinTransaction(manager, {
          paymentId: payment.id,
          receivableId: item.receivableId,
          amount: item.amount,
          allocatedByUserId: input.allocatedByUserId,
        });
      }

      const matchedTransaction = transaction.markMatched();
      await this.bankTransactionRepo.save(matchedTransaction, manager);

      return matchedTransaction;
    });
  }
}
```

`payment.unallocatedAmount` (`totalAmount - allocatedAmount`) is left non-zero whenever `sumAllocations < transaction.amount` — this IS the "leftover → credit balance, no auto-apply" behavior from spec mục 1, bước 5; no separate overpayment code path is needed because `Payment` already models it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test match-bank-transaction.usecase.spec.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.ts apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.spec.ts
git commit -m "feat: add MatchBankTransactionUseCase with optimistic-locked multi-allocation matching"
```

---

### Task 7: Skip and Mark-Prepaid use cases

**Files:**
- Create: `apps/backend/src/modules/exception-queue/application/skip-bank-transaction.usecase.ts`
- Test: `apps/backend/src/modules/exception-queue/application/skip-bank-transaction.usecase.spec.ts`
- Create: `apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.ts`
- Test: `apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankTransactionRepository` (Task 4), `IPaymentRepository` (Domain Core plan), `TenantContextService`, `AuditContextService`
- Produces: `SkipBankTransactionUseCase.execute(id)`, `MarkPrepaidBankTransactionUseCase.execute(input)` — used by Task 8's controller

- [ ] **Step 1: Write failing tests for `SkipBankTransactionUseCase`**

Create `apps/backend/src/modules/exception-queue/application/skip-bank-transaction.usecase.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { SkipBankTransactionUseCase } from './skip-bank-transaction.usecase';

function buildTransaction(): BankTransaction {
  return new BankTransaction({
    id: 'bt-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'wh-1',
    providerTransactionId: 'TX-001',
    amount: 5_000_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'NGUYEN VAN A',
    transferContent: 'chuyen tien khong ro noi dung',
    status: 'PENDING_REVIEW',
    version: 1,
    createdAt: new Date('2026-08-01'),
  });
}

describe('SkipBankTransactionUseCase', () => {
  it('marks a transaction IGNORED and does not create any allocation', async () => {
    const bankTransactionRepo = { findById: jest.fn().mockResolvedValue(buildTransaction()), save: jest.fn() };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };

    const useCase = new SkipBankTransactionUseCase(bankTransactionRepo as any, auditContext as any);
    const result = await useCase.execute('bt-1');

    expect(result.status).toBe('IGNORED');
    expect(bankTransactionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'IGNORED' }));
    expect(auditContext.setBefore).toHaveBeenCalled();
  });

  it('throws NotFoundException when the transaction does not exist', async () => {
    const bankTransactionRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };
    const useCase = new SkipBankTransactionUseCase(bankTransactionRepo as any, auditContext as any);

    await expect(useCase.execute('missing')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test skip-bank-transaction.usecase.spec.ts`
Expected: FAIL — Cannot find module './skip-bank-transaction.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/exception-queue/application/skip-bank-transaction.usecase.ts`**

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IBankTransactionRepository,
  BANK_TRANSACTION_REPOSITORY,
} from '../../webhooks/application/bank-transaction-repository.port';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { AuditContextService } from '../../../common/audit/audit-context';

@Injectable()
export class SkipBankTransactionUseCase {
  constructor(
    @Inject(BANK_TRANSACTION_REPOSITORY) private readonly bankTransactionRepo: IBankTransactionRepository,
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(bankTransactionId: string): Promise<BankTransaction> {
    const transaction = await this.bankTransactionRepo.findById(bankTransactionId);
    if (!transaction) {
      throw new NotFoundException('Bank transaction not found');
    }
    this.auditContext.setBefore(transaction);
    const ignored = transaction.markIgnored();
    await this.bankTransactionRepo.save(ignored);
    return ignored;
  }
}
```

No `version` check here — see Global Constraints: skip creates no `PaymentAllocation`, so a race between two skips (or a skip racing a match, which itself IS version-checked on the match side) has no financial-double-spend consequence.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test skip-bank-transaction.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Write failing tests for `MarkPrepaidBankTransactionUseCase`**

Create `apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { MarkPrepaidBankTransactionUseCase } from './mark-prepaid-bank-transaction.usecase';

function buildTransaction(status: string = 'PENDING_REVIEW'): BankTransaction {
  return new BankTransaction({
    id: 'bt-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'wh-1',
    providerTransactionId: 'TX-001',
    amount: 8_000_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'CONG TY C',
    transferContent: 'tam ung don hang thang 9',
    status: status as any,
    version: 1,
    createdAt: new Date('2026-08-01'),
  });
}

describe('MarkPrepaidBankTransactionUseCase', () => {
  it('creates an unallocated Payment attributed to the customer and marks the transaction MATCHED', async () => {
    const bankTransactionRepo = { findById: jest.fn().mockResolvedValue(buildTransaction()), save: jest.fn() };
    const paymentRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };

    const useCase = new MarkPrepaidBankTransactionUseCase(
      bankTransactionRepo as any,
      paymentRepo as any,
      tenantContext as any,
      auditContext as any,
    );

    const result = await useCase.execute({ bankTransactionId: 'bt-1', customerId: 'cust-1' });

    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', allocatedAmount: 0, totalAmount: 8_000_000 }),
    );
    expect(result.transaction.status).toBe('MATCHED');
  });

  it('throws BadRequestException when the transaction is already MATCHED', async () => {
    const bankTransactionRepo = { findById: jest.fn().mockResolvedValue(buildTransaction('MATCHED')), save: jest.fn() };
    const paymentRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };
    const useCase = new MarkPrepaidBankTransactionUseCase(
      bankTransactionRepo as any,
      paymentRepo as any,
      tenantContext as any,
      auditContext as any,
    );

    await expect(useCase.execute({ bankTransactionId: 'bt-1', customerId: 'cust-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the transaction does not exist', async () => {
    const bankTransactionRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const paymentRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };
    const useCase = new MarkPrepaidBankTransactionUseCase(
      bankTransactionRepo as any,
      paymentRepo as any,
      tenantContext as any,
      auditContext as any,
    );

    await expect(useCase.execute({ bankTransactionId: 'missing', customerId: 'cust-1' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test mark-prepaid-bank-transaction.usecase.spec.ts`
Expected: FAIL — Cannot find module './mark-prepaid-bank-transaction.usecase'

- [ ] **Step 7: Create `apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.ts`**

```typescript
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IBankTransactionRepository,
  BANK_TRANSACTION_REPOSITORY,
} from '../../webhooks/application/bank-transaction-repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from '../../payments/application/payment-repository.port';
import { Payment } from '../../payments/domain/payment';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { AuditContextService } from '../../../common/audit/audit-context';

export interface MarkPrepaidBankTransactionInput {
  bankTransactionId: string;
  customerId: string;
}

export interface MarkPrepaidBankTransactionResult {
  transaction: BankTransaction;
  payment: Payment;
}

const TERMINAL_STATUSES = new Set(['MATCHED', 'IGNORED']);

@Injectable()
export class MarkPrepaidBankTransactionUseCase {
  constructor(
    @Inject(BANK_TRANSACTION_REPOSITORY) private readonly bankTransactionRepo: IBankTransactionRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    private readonly tenantContext: TenantContextService,
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(input: MarkPrepaidBankTransactionInput): Promise<MarkPrepaidBankTransactionResult> {
    const transaction = await this.bankTransactionRepo.findById(input.bankTransactionId);
    if (!transaction) {
      throw new NotFoundException('Bank transaction not found');
    }
    if (TERMINAL_STATUSES.has(transaction.status)) {
      throw new BadRequestException(`Cannot mark a transaction in status ${transaction.status} as prepaid`);
    }

    this.auditContext.setBefore(transaction);

    const organizationId = this.tenantContext.getOrganizationId();
    const payment = new Payment({
      id: randomUUID(),
      organizationId,
      bankTransactionId: transaction.id,
      customerId: input.customerId,
      totalAmount: transaction.amount,
      allocatedAmount: 0,
      payerName: transaction.counterpartyName,
      receivedAt: transaction.transactionDateTime,
      createdAt: new Date(),
    });
    await this.paymentRepo.save(payment);

    const matched = transaction.markMatched();
    await this.bankTransactionRepo.save(matched);

    return { transaction: matched, payment };
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test mark-prepaid-bank-transaction.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/exception-queue/application/skip-bank-transaction.usecase.ts apps/backend/src/modules/exception-queue/application/skip-bank-transaction.usecase.spec.ts apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.ts apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.spec.ts
git commit -m "feat: add SkipBankTransactionUseCase and MarkPrepaidBankTransactionUseCase"
```

---

### Task 8: Read endpoints + controller + module wiring

**Files:**
- Create: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts`
- Test: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.spec.ts`
- Create: `apps/backend/src/modules/exception-queue/presentation/dto/match-bank-transaction.dto.ts`
- Create: `apps/backend/src/modules/exception-queue/presentation/dto/mark-prepaid-bank-transaction.dto.ts`
- Create: `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`
- Create: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `IBankTransactionRepository`/`IMatchingCandidateRepository` (Task 4), all three use cases (Tasks 6-7), `PermissionGuard`/`@RequirePermission` (Multi-tenancy plan)
- Produces: `GET /bank-transactions/unmatched`, `GET /bank-transactions/pending-review-count`, `GET /bank-transactions/:id/candidates`, `POST /bank-transactions/:id/match`, `POST /bank-transactions/:id/skip`, `POST /bank-transactions/:id/mark-prepaid` — used by the FE sidebar and Task 9's integration tests

- [ ] **Step 1: Write failing test for `UnmatchedBankTransactionsQueryService`**

Create `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.spec.ts`:

```typescript
import { UnmatchedBankTransactionsQueryService } from './unmatched-bank-transactions-query.service';

describe('UnmatchedBankTransactionsQueryService', () => {
  it('pairs each PENDING_REVIEW transaction with its highest-scoring candidate', async () => {
    const bankTransactionRepo = {
      findManyByStatus: jest.fn().mockResolvedValue([{ id: 'bt-1' }, { id: 'bt-2' }]),
    };
    const matchingCandidateRepo = {
      findByBankTransactionId: jest.fn((bankTransactionId: string) =>
        Promise.resolve(
          bankTransactionId === 'bt-1'
            ? [{ id: 'mc-1', totalScore: 80 }, { id: 'mc-2', totalScore: 65 }]
            : [],
        ),
      ),
    };

    const service = new UnmatchedBankTransactionsQueryService(bankTransactionRepo as any, matchingCandidateRepo as any);
    const result = await service.execute();

    expect(result).toEqual({
      items: [
        { transaction: { id: 'bt-1' }, topCandidate: { id: 'mc-1', totalScore: 80 } },
        { transaction: { id: 'bt-2' }, topCandidate: null },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
    expect(bankTransactionRepo.findManyByStatus).toHaveBeenCalledWith('PENDING_REVIEW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test unmatched-bank-transactions-query.service.spec.ts`
Expected: FAIL — Cannot find module './unmatched-bank-transactions-query.service'

- [ ] **Step 3: Create `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  IBankTransactionRepository,
  BANK_TRANSACTION_REPOSITORY,
} from '../../webhooks/application/bank-transaction-repository.port';
import {
  IMatchingCandidateRepository,
  MATCHING_CANDIDATE_REPOSITORY,
} from '../../webhooks/application/matching-candidate-repository.port';
import { MatchingCandidate } from '../../webhooks/domain/matching-candidate';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';

export interface UnmatchedBankTransactionView {
  transaction: BankTransaction;
  topCandidate: MatchingCandidate | null;
}

@Injectable()
export class UnmatchedBankTransactionsQueryService {
  constructor(
    @Inject(BANK_TRANSACTION_REPOSITORY) private readonly bankTransactionRepo: IBankTransactionRepository,
    @Inject(MATCHING_CANDIDATE_REPOSITORY)
    private readonly matchingCandidateRepo: IMatchingCandidateRepository,
  ) {}

  async execute(page = 1, limit = 20): Promise<{ items: UnmatchedBankTransactionView[]; total: number; page: number; limit: number }> {
    const transactions = await this.bankTransactionRepo.findManyByStatus('PENDING_REVIEW');
    const pageTransactions = transactions.slice((page - 1) * limit, page * limit);
    return Promise.all(
      pageTransactions.map(async (transaction) => {
        const candidates = await this.matchingCandidateRepo.findByBankTransactionId(transaction.id);
        return { transaction, topCandidate: candidates[0] ?? null };
      }),
    ).then((items) => ({ items, total: transactions.length, page, limit }));
  }
}
```

`findManyByStatus` is intentionally reused and paged in memory for the MVP read queue (`ponytail: replace with a SQL COUNT/OFFSET query when one organization's review queue becomes large`). The financial write paths remain transaction-safe; this shortcut only affects list latency.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test unmatched-bank-transactions-query.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Create the request DTOs**

`apps/backend/src/modules/exception-queue/presentation/dto/match-bank-transaction.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsPositive, IsUUID, ValidateNested } from 'class-validator';

class MatchAllocationItemDto {
  @IsUUID()
  receivableId: string;

  @IsInt()
  @IsPositive()
  amount: number;
}

export class MatchBankTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MatchAllocationItemDto)
  allocations: MatchAllocationItemDto[];

  @IsInt()
  version: number;
}
```

`apps/backend/src/modules/exception-queue/presentation/dto/mark-prepaid-bank-transaction.dto.ts`:

```typescript
import { IsUUID } from 'class-validator';

export class MarkPrepaidBankTransactionDto {
  @IsUUID()
  customerId: string;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`**

```typescript
import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { Audited } from '../../../common/audit/audited.decorator';
import { AuditActionType } from '../../../common/audit/audit-action-type.enum';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import {
  IBankTransactionRepository,
  BANK_TRANSACTION_REPOSITORY,
} from '../../webhooks/application/bank-transaction-repository.port';
import {
  IMatchingCandidateRepository,
  MATCHING_CANDIDATE_REPOSITORY,
} from '../../webhooks/application/matching-candidate-repository.port';
import { UnmatchedBankTransactionsQueryService } from '../application/unmatched-bank-transactions-query.service';
import { MatchBankTransactionUseCase } from '../application/match-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from '../application/skip-bank-transaction.usecase';
import { MarkPrepaidBankTransactionUseCase } from '../application/mark-prepaid-bank-transaction.usecase';
import { MatchBankTransactionDto } from './dto/match-bank-transaction.dto';
import { MarkPrepaidBankTransactionDto } from './dto/mark-prepaid-bank-transaction.dto';

@Controller('bank-transactions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExceptionQueueController {
  constructor(
    private readonly unmatchedQuery: UnmatchedBankTransactionsQueryService,
    @Inject(BANK_TRANSACTION_REPOSITORY) private readonly bankTransactionRepo: IBankTransactionRepository,
    @Inject(MATCHING_CANDIDATE_REPOSITORY)
    private readonly matchingCandidateRepo: IMatchingCandidateRepository,
    private readonly matchUseCase: MatchBankTransactionUseCase,
    private readonly skipUseCase: SkipBankTransactionUseCase,
    private readonly markPrepaidUseCase: MarkPrepaidBankTransactionUseCase,
  ) {}

  @Get('unmatched')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async unmatched(@Query('page') page = '1', @Query('limit') limit = '20') {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    return this.unmatchedQuery.execute(parsedPage, parsedLimit);
  }

  @Get('pending-review-count')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async pendingReviewCount() {
    return { count: await this.bankTransactionRepo.countByStatus('PENDING_REVIEW') };
  }

  @Get(':id/candidates')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async candidates(@Param('id') id: string) {
    const transaction = await this.bankTransactionRepo.findById(id);
    if (!transaction) {
      throw new NotFoundException('Bank transaction not found');
    }
    return this.matchingCandidateRepo.findByBankTransactionId(id);
  }

  @Post(':id/match')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(AuditActionType.PAYMENT_ALLOCATE, 'BankTransaction')
  async match(@Param('id') id: string, @Body() dto: MatchBankTransactionDto, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.matchUseCase.execute({
      bankTransactionId: id,
      allocations: dto.allocations,
      version: dto.version,
      allocatedByUserId: user.userId,
    });
  }

  @Post(':id/skip')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(AuditActionType.BANK_TRANSACTION_SKIP, 'BankTransaction')
  async skip(@Param('id') id: string) {
    return this.skipUseCase.execute(id);
  }

  @Post(':id/mark-prepaid')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(AuditActionType.BANK_TRANSACTION_MARK_PREPAID, 'BankTransaction')
  async markPrepaid(@Param('id') id: string, @Body() dto: MarkPrepaidBankTransactionDto) {
    return this.markPrepaidUseCase.execute({ bankTransactionId: id, customerId: dto.customerId });
  }
}
```

Every write endpoint reuses `Permission.PAYMENT_ALLOCATE` (Multi-tenancy plan, Task 8) rather than introducing a new permission — the spec doesn't define one, and all three actions are steps inside the same accountant workflow the permission already gates.

- [ ] **Step 7: Create `apps/backend/src/modules/exception-queue/exception-queue.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PaymentsModule } from '../payments/payments.module';
import { ExceptionQueueController } from './presentation/exception-queue.controller';
import { MatchBankTransactionUseCase } from './application/match-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from './application/skip-bank-transaction.usecase';
import { MarkPrepaidBankTransactionUseCase } from './application/mark-prepaid-bank-transaction.usecase';
import { UnmatchedBankTransactionsQueryService } from './application/unmatched-bank-transactions-query.service';

@Module({
  imports: [WebhooksModule, ReceivablesModule, PaymentsModule],
  controllers: [ExceptionQueueController],
  providers: [
    MatchBankTransactionUseCase,
    SkipBankTransactionUseCase,
    MarkPrepaidBankTransactionUseCase,
    UnmatchedBankTransactionsQueryService,
  ],
})
export class ExceptionQueueModule {}
```

- [ ] **Step 8: Register `ExceptionQueueModule` in `apps/backend/src/app.module.ts`**

Add to `imports`.

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/exception-queue apps/backend/src/app.module.ts
git commit -m "feat: add Exception Queue controller with unmatched/candidates/match/skip/mark-prepaid endpoints"
```

---

### Task 9: Integration tests — concurrent match (409) and multi-allocation match

**Files:**
- Create: `apps/backend/test/exception-queue-concurrent-match.integration.spec.ts`
- Create: `apps/backend/test/exception-queue-multi-allocation-match.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (all prior tasks), real Postgres via testcontainers
- Produces: verified proof of `2026-08-03-testing-strategy-design.md`'s mandatory concurrency case (case 4) plus the multi-allocation split-match happy path

- [ ] **Step 1: Write the concurrent-match integration test**

Create `apps/backend/test/exception-queue-concurrent-match.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';

describe('Exception Queue concurrent match (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000020';
  const customerId = '00000000-0000-0000-0000-000000000021';
  const receivableId = '00000000-0000-0000-0000-000000000022';
  const bankTransactionId = '00000000-0000-0000-0000-000000000023';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty Concurrent',
      taxCode: '999',
      email: 'concurrent@b.vn',
      phone: '0900000099',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 30_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: '00000000-0000-0000-0000-000000000024',
      createdAt: new Date(),
      closedAt: null,
    });

    await dataSource.getRepository(BankTransactionOrmEntity).save({
      id: bankTransactionId,
      organizationId,
      bankConnectionId: '00000000-0000-0000-0000-000000000025',
      webhookInboxId: '00000000-0000-0000-0000-000000000026',
      providerTransactionId: 'TX-CONCURRENT-001',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY CONCURRENT',
      transferContent: 'chuyen tien khong ro',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function token(): string {
    return jwtService.sign({ userId: 'user-1', organizationId, role: 'OWNER' });
  }

  it('lets exactly one of two concurrent match requests succeed, the other gets 409', async () => {
    const authToken = token();
    const requestBody = {
      allocations: [{ receivableId, amount: 30_000_000 }],
      version: 1,
    };

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/bank-transactions/${bankTransactionId}/match`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(requestBody),
      request(app.getHttpServer())
        .post(`/api/v1/bank-transactions/${bankTransactionId}/match`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(requestBody),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const bankTransactionRow = await dataSource.query(
      'SELECT status, version FROM bank_transactions WHERE id = $1',
      [bankTransactionId],
    );
    expect(bankTransactionRow[0].status).toBe('MATCHED');
    expect(Number(bankTransactionRow[0].version)).toBe(2);

    const allocationRows = await dataSource.query(
      'SELECT COUNT(*) FROM payment_allocations WHERE "receivableId" = $1',
      [receivableId],
    );
    expect(Number(allocationRows[0].count)).toBe(1);
  }, 20_000);
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- exception-queue-concurrent-match.integration.spec.ts`
Expected: PASS

- [ ] **Step 3: Write the multi-allocation match integration test**

Create `apps/backend/test/exception-queue-multi-allocation-match.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';

describe('Exception Queue multi-allocation match (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000030';
  const customerId = '00000000-0000-0000-0000-000000000031';
  const receivableIdA = '00000000-0000-0000-0000-000000000032';
  const receivableIdB = '00000000-0000-0000-0000-000000000033';
  const bankTransactionId = '00000000-0000-0000-0000-000000000034';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty Split',
      taxCode: '888',
      email: 'split@b.vn',
      phone: '0900000088',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(ReceivableOrmEntity).save([
      {
        id: receivableIdA,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 20_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-09-01'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: '00000000-0000-0000-0000-000000000035',
        createdAt: new Date(),
        closedAt: null,
      },
      {
        id: receivableIdB,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: 15_000_000,
        paidAmount: 0,
        dueDate: new Date('2026-09-01'),
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: '00000000-0000-0000-0000-000000000035',
        createdAt: new Date(),
        closedAt: null,
      },
    ]);

    await dataSource.getRepository(BankTransactionOrmEntity).save({
      id: bankTransactionId,
      organizationId,
      bankConnectionId: '00000000-0000-0000-0000-000000000036',
      webhookInboxId: '00000000-0000-0000-0000-000000000037',
      providerTransactionId: 'TX-SPLIT-001',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01'),
      counterpartyAccountNumber: '0011002244',
      counterpartyName: 'CONG TY SPLIT',
      transferContent: 'thanh toan 2 hoa don',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('splits one transaction across two receivables in a single request, leaving the remainder unallocated', async () => {
    const authToken = jwtService.sign({ userId: 'user-1', organizationId, role: 'OWNER' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${bankTransactionId}/match`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        allocations: [
          { receivableId: receivableIdA, amount: 20_000_000 },
          { receivableId: receivableIdB, amount: 5_000_000 },
        ],
        version: 1,
      })
      .expect(201);

    expect(response.body.status).toBe('MATCHED');

    const bankTransactionRow = await dataSource.query('SELECT status FROM bank_transactions WHERE id = $1', [
      bankTransactionId,
    ]);
    expect(bankTransactionRow[0].status).toBe('MATCHED');

    const receivableARow = await dataSource.query('SELECT status, "paidAmount" FROM receivables WHERE id = $1', [
      receivableIdA,
    ]);
    expect(receivableARow[0].status).toBe('PAID');
    expect(Number(receivableARow[0].paidAmount)).toBe(20_000_000);

    const receivableBRow = await dataSource.query('SELECT status, "paidAmount" FROM receivables WHERE id = $1', [
      receivableIdB,
    ]);
    expect(receivableBRow[0].status).toBe('PARTIALLY_PAID');
    expect(Number(receivableBRow[0].paidAmount)).toBe(5_000_000);

    const allocationRows = await dataSource.query(
      'SELECT "receivableId", "allocatedAmount" FROM payment_allocations WHERE "paymentId" IN (SELECT id FROM payments WHERE "bankTransactionId" = $1) ORDER BY "receivableId"',
      [bankTransactionId],
    );
    expect(allocationRows).toHaveLength(2);

    const paymentRow = await dataSource.query(
      'SELECT "totalAmount", "allocatedAmount" FROM payments WHERE "bankTransactionId" = $1',
      [bankTransactionId],
    );
    expect(Number(paymentRow[0].totalAmount)).toBe(30_000_000);
    expect(Number(paymentRow[0].allocatedAmount)).toBe(25_000_000); // 5,000,000 leftover as unapplied credit
  }, 20_000);
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- exception-queue-multi-allocation-match.integration.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite (unit + e2e)**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/test/exception-queue-concurrent-match.integration.spec.ts apps/backend/test/exception-queue-multi-allocation-match.integration.spec.ts
git commit -m "test: add integration tests for concurrent match locking and multi-allocation matching"
```

---

## Self-Review Notes

- **Spec coverage:** `GET /bank-transactions/unmatched` (mục 1) → Task 8. `GET /bank-transactions/:id/candidates` (mục 1) → Task 8. `POST /bank-transactions/:id/match` optimistic lock + validation + atomic multi-allocation + leftover-as-credit-balance (mục 1, bước 1-5) → Task 6, verified by Task 9. `POST /bank-transactions/:id/skip` with `AuditLog` (mục 1) → Task 7 + Task 3's `@Audited` wiring on the controller. `POST /bank-transactions/:id/mark-prepaid` (mục 1) → Task 7. `AuditLog` structure, INSERT-only, decorator+interceptor mechanism, mandatory action list (mục 2) → Tasks 1-3.
- **Open questions from spec mục 4, answered:** (1) `skip`/`mark-prepaid` don't need `version` — documented in Global Constraints and Task 7, reasoning: no `PaymentAllocation` is created by either, so no double-spend risk exists to guard against. (2) `beforeState`/`afterState` sensitive-field filtering — `sanitizeAuditPayload()` (Task 1) redacts a fixed denylist (`accessToken`, `refreshToken`, `secretKey`, `password`, `token`) recursively before every insert. `AuditContextService` now stores both snapshots through `setBefore/getBefore` and `setAfter/getAfter`; the interceptor sets `after` only on successful handler completion.
- **Shared allocation core:** `MatchBankTransactionUseCase` opens the single outer transaction and calls `AllocatePaymentUseCase.allocateWithinTransaction(manager, input)` for each item. The money/status/customer invariant exists only in Domain Core; this plan does not duplicate it.
- **Not covered in this plan (by design):** The Cas ID bank connection plan and Reminder Automation / Billing plans own their own controllers (`BANK_CONNECTION_CREATE`, `REMINDER_POLICY_UPDATE`, `SUBSCRIPTION_CHANGE_PLAN` action types are defined here so those plans can attach `@Audited` immediately, but wiring those decorators is out of scope here). Domain Core owns the `PAYMENT_ALLOCATE_UNDO` audit inline inside its transaction; it must not also attach `@Audited` or the action would be logged twice. `RECEIVABLE_UPDATE`, `RECEIVABLE_CANCEL`, and `RECEIVABLE_DISPUTE` remain reserved until their owning plans add endpoints.
- **Type consistency checked:** `IBankTransactionRepository`/`IMatchingCandidateRepository` signatures (Task 4) match every caller added in Tasks 6-8 and their unit test mocks. `Payment.customerId` is resolved from the first selected receivable for a manual match; the shared allocation core rejects any later receivable from another customer. `AuditedMetadata { actionType, entityType }` shape is identical between `audited.decorator.ts` and `audit.interceptor.ts`'s `getAllAndOverride<AuditedMetadata>()` call.


