# Collection Activity Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `CollectionActivity` as a denormalized display log (`apps/backend/src/modules/collection-activity/`), following the same 4-layer Clean Architecture as every other module. `CollectionActivity` **is not the source of truth** — the actual business state remains in `ReminderExecution`/`PaymentAllocation`/`Dispute`/`Receivable`. A single `CollectionActivityListener` (`@OnEvent(...)`) listens for `payment.allocated`, `receivable.closed`, `dispute.opened`, `dispute.resolved`, `reminder.sent`, `reminder.failed` and writes rows — no service writes `CollectionActivity` in scattered locations. `AllocatePaymentUseCase` (already existing from the project-scaffolding-and-domain-core plan and migrated to `BaseRepository`/`TenantContextService` by the multi-tenancy-rbac plan) is modified to emit `payment.allocated` after the transaction succeeds, and to additionally emit `receivable.closed` if that allocation causes `Receivable.status` to change to `PAID` — this is currently the ONLY place where `status` changes to `PAID`, so no additional hook is needed elsewhere. INSERT only; there are no PATCH/DELETE endpoints for `CollectionActivity`.

**Architecture:** The `collection-activity` module is independent (domain/application/infrastructure/presentation), reuses `BaseRepository`/`TenantContextService` (multi-tenancy-rbac plan) and `Permission.RECEIVABLE_READ`/`Permission.RECEIVABLE_WRITE` (already present in the `Permission` enum — do not add a new permission because the spec does not require a separate timeline permission). `CollectionActivityModule` has a one-way dependency on `ReceivablesModule` (it needs `RECEIVABLE_REPOSITORY` to look up `customerId` from `receivableId` for events that do not already include `customerId`, such as `dispute.opened`/`dispute.resolved`/`reminder.sent`/`reminder.failed`) — there is no reverse dependency, so `forwardRef()` is not needed.

**Tech Stack:** Inherits the tech stack unchanged from project-scaffolding-and-domain-core.md and multi-tenancy-rbac.md (NestJS 10, TypeORM 0.3, Postgres 16, Jest + testcontainers + supertest). `@nestjs/event-emitter` and `EventEmitterModule.forRoot()` **were already added by the dispute-management plan** (Task 3) — this plan does NOT reinstall the package or register `EventEmitterModule.forRoot()` again; it only imports `EventEmitter2`/`@OnEvent` as an already-available dependency.

## Global Constraints

- `domain/collection-activity.ts` imports nothing from NestJS/TypeORM (preserving the Clean Architecture principle across the project).
- `CollectionActivity` is INSERT-only — there is no `update()`/`delete()` on the domain class and no PATCH/DELETE route on the controller (collection-activity-timeline spec section 4, consistent with the immutability principle of AuditLog).
- The only write sources are `CollectionActivityListener` for 6 automatic events (`payment.allocated`, `receivable.closed`, `dispute.opened`, `dispute.resolved`, `reminder.sent`, `reminder.failed`) plus `RecordManualActivityUseCase` for 3 manual types (`MANUAL_CALL`/`MANUAL_NOTE`/`PAYMENT_COMMITMENT`) — no other business service may call `ICollectionActivityRepository.create` directly.
- Events are emitted only **after** the transaction/save succeeds (matching the principle established in dispute-management plan Task 3 Steps 5/9 and collection-activity-timeline spec section 2.1).
- Naming follows the project exactly: `CollectionActivityOrmEntity`, `ICollectionActivityRepository`, DI token `COLLECTION_ACTIVITY_REPOSITORY`, `CollectionActivityListener`, `CollectionActivityController` (predefined; do not rename).
- Every read/write endpoint uses `@UseGuards(JwtAuthGuard, PermissionGuard)` + `@RequirePermission(...)`, reusing `Permission.RECEIVABLE_READ` for the 2 timeline read endpoints (specified in the task) and `Permission.RECEIVABLE_WRITE` for the manual-write endpoint (there is no separate `COLLECTION_ACTIVITY_*` permission in the current enum, and the spec does not require one — see Self-Review Notes).
- Amounts in `metadata` retain the integer-in-dong type (domain-core section 4); do not format or round them in the application layer.

---

## File Structure

```
apps/backend/
  src/
    app.module.ts                                                    -- MODIFY: register CollectionActivityModule
    modules/
      collection-activity/
        domain/
          collection-activity.ts                                     -- NEW: CollectionActivity domain class + CollectionActivityType enum
        application/
          collection-activity-repository.port.ts                     -- NEW: ICollectionActivityRepository, COLLECTION_ACTIVITY_REPOSITORY
          record-manual-activity.usecase.ts                           -- NEW: RecordManualActivityUseCase
          get-receivable-timeline.usecase.ts                          -- NEW: GetReceivableTimelineUseCase
          get-customer-timeline.usecase.ts                            -- NEW: GetCustomerTimelineUseCase
          collection-activity.listener.ts                             -- NEW: CollectionActivityListener (@OnEvent handlers)
        infrastructure/
          collection-activity.orm-entity.ts                           -- NEW: CollectionActivityOrmEntity
          typeorm-collection-activity.repository.ts                   -- NEW: TypeOrmCollectionActivityRepository extends BaseRepository
        presentation/
          dto/create-manual-activity.dto.ts                           -- NEW: CreateManualActivityDto
          collection-activity.controller.ts                           -- NEW: CollectionActivityController
        collection-activity.module.ts                                 -- NEW: CollectionActivityModule
      payments/
        application/
          allocate-payment.usecase.ts                                 -- MODIFY: emit payment.allocated / receivable.closed via EventEmitter2
          allocate-payment.usecase.spec.ts                             -- MODIFY: add EventEmitter2 mock + assertions
  test/
    collection-activity-timeline.integration.spec.ts                  -- NEW: testcontainers + supertest end-to-end proof
```

---

### Task 1: `CollectionActivity` domain entity

**Files:**
- Create: `apps/backend/src/modules/collection-activity/domain/collection-activity.ts`
- Test: `apps/backend/src/modules/collection-activity/domain/collection-activity.spec.ts`

**Interfaces:**
- Consumes: nothing (plain domain class, no framework import — same pattern as `Invoice`/`Dispute`)
- Produces: `CollectionActivity` domain class, `CollectionActivityType` enum, `MANUAL_ACTIVITY_TYPES` constant — used by Task 2 (ORM entity), Task 3 (`RecordManualActivityUseCase`), Task 4 (`CollectionActivityListener`)

- [ ] **Step 1: Write failing domain tests**

Create `apps/backend/src/modules/collection-activity/domain/collection-activity.spec.ts`:

```typescript
import { CollectionActivity, CollectionActivityType, MANUAL_ACTIVITY_TYPES } from './collection-activity';

describe('CollectionActivity domain entity', () => {
  it('creates an activity with metadata and a nullable createdByUserId (system-recorded)', () => {
    const activity = new CollectionActivity({
      id: 'act-1',
      organizationId: 'org-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      activityType: CollectionActivityType.PAYMENT_RECEIVED,
      description: 'Received payment of 30,000,000 VND',
      metadata: { paymentId: 'pay-1', amount: 30_000_000 },
      createdByUserId: null,
      createdAt: new Date('2026-08-03'),
    });

    expect(activity.activityType).toBe(CollectionActivityType.PAYMENT_RECEIVED);
    expect(activity.createdByUserId).toBeNull();
    expect(activity.metadata).toEqual({ paymentId: 'pay-1', amount: 30_000_000 });
  });

  it('creates a manual activity with a non-null createdByUserId', () => {
    const activity = new CollectionActivity({
      id: 'act-2',
      organizationId: 'org-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      activityType: CollectionActivityType.MANUAL_CALL,
      description: 'Called to remind the customer',
      metadata: {},
      createdByUserId: 'user-1',
      createdAt: new Date('2026-08-03'),
    });

    expect(activity.createdByUserId).toBe('user-1');
  });

  it('exposes MANUAL_ACTIVITY_TYPES as exactly the 3 manually-recordable types', () => {
    expect(MANUAL_ACTIVITY_TYPES).toEqual([
      CollectionActivityType.MANUAL_CALL,
      CollectionActivityType.MANUAL_NOTE,
      CollectionActivityType.PAYMENT_COMMITMENT,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test collection-activity.spec.ts`
Expected: FAIL — Cannot find module './collection-activity'

- [ ] **Step 3: Create `apps/backend/src/modules/collection-activity/domain/collection-activity.ts`**

```typescript
export enum CollectionActivityType {
  INVOICE_CREATED = 'INVOICE_CREATED',
  EMAIL_SENT = 'EMAIL_SENT',
  EMAIL_FAILED = 'EMAIL_FAILED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  RECEIVABLE_CLOSED = 'RECEIVABLE_CLOSED',
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  MANUAL_CALL = 'MANUAL_CALL',
  MANUAL_NOTE = 'MANUAL_NOTE',
  PAYMENT_COMMITMENT = 'PAYMENT_COMMITMENT',
}

export const MANUAL_ACTIVITY_TYPES = [
  CollectionActivityType.MANUAL_CALL,
  CollectionActivityType.MANUAL_NOTE,
  CollectionActivityType.PAYMENT_COMMITMENT,
] as const;

export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];

export interface CollectionActivityProps {
  id: string;
  organizationId: string;
  receivableId: string;
  customerId: string;
  activityType: CollectionActivityType;
  description: string;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export class CollectionActivity {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly customerId: string;
  readonly activityType: CollectionActivityType;
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;

  constructor(props: CollectionActivityProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.receivableId = props.receivableId;
    this.customerId = props.customerId;
    this.activityType = props.activityType;
    this.description = props.description;
    this.metadata = props.metadata;
    this.createdByUserId = props.createdByUserId;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test collection-activity.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/collection-activity/domain
git commit -m "feat: add CollectionActivity domain entity and CollectionActivityType enum"
```

---

### Task 2: Infrastructure — ORM entity + `BaseRepository`-scoped repository

**Files:**
- Create: `apps/backend/src/modules/collection-activity/infrastructure/collection-activity.orm-entity.ts`
- Create: `apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts`
- Create: `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts`
- Create: `apps/backend/src/modules/collection-activity/collection-activity.module.ts`

**Interfaces:**
- Consumes: `CollectionActivity` domain class (Task 1), `BaseRepository`/`TenantContextService` (`apps/backend/src/common/tenancy/base.repository.ts`, `.../tenant-context.ts` — multi-tenancy-rbac plan Task 5), `ReceivablesModule` (`apps/backend/src/modules/receivables/receivables.module.ts`, already exports `RECEIVABLE_REPOSITORY` and `TypeOrmModule` per project-scaffolding plan Task 10)
- Produces: `ICollectionActivityRepository` with `create`, `findByReceivableId`, `findByCustomerId` — used by Task 3 (`RecordManualActivityUseCase`), Task 4 (`CollectionActivityListener`), Task 6 (read use cases)

- [ ] **Step 1: Create `apps/backend/src/modules/collection-activity/infrastructure/collection-activity.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CollectionActivityType } from '../domain/collection-activity';

@Entity({ name: 'collection_activities' })
@Index(['receivableId', 'createdAt'])
@Index(['customerId', 'createdAt'])
export class CollectionActivityOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column()
  customerId: string;

  @Column({ type: 'enum', enum: CollectionActivityType })
  activityType: CollectionActivityType;

  @Column()
  description: string;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @Column()
  createdAt: Date;
}
```

`@Index(['receivableId', 'createdAt'])` and `@Index(['customerId', 'createdAt'])` exist because `GET /receivables/:id/timeline` and `GET /customers/:id/timeline` (Task 6) both query and sort with `ORDER BY createdAt DESC` on exactly these 2 columns, avoiding a full scan of the `collection_activities` table as it grows over time.

- [ ] **Step 2: Create `apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts`**

```typescript
import { CollectionActivity } from '../domain/collection-activity';

export interface ICollectionActivityRepository {
  create(activity: CollectionActivity): Promise<void>;
  findByReceivableId(receivableId: string): Promise<CollectionActivity[]>;
  findByCustomerId(customerId: string): Promise<CollectionActivity[]>;
}

export const COLLECTION_ACTIVITY_REPOSITORY = Symbol('COLLECTION_ACTIVITY_REPOSITORY');
```

- [ ] **Step 3: Create `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CollectionActivity } from '../domain/collection-activity';
import { ICollectionActivityRepository } from '../application/collection-activity-repository.port';
import { CollectionActivityOrmEntity } from './collection-activity.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCollectionActivityRepository
  extends BaseRepository<CollectionActivityOrmEntity>
  implements ICollectionActivityRepository
{
  constructor(
    @InjectRepository(CollectionActivityOrmEntity) repo: Repository<CollectionActivityOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(activity: CollectionActivity): Promise<void> {
    await this.ormRepo.insert(activity as unknown as CollectionActivityOrmEntity);
  }

  async findByReceivableId(receivableId: string): Promise<CollectionActivity[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { receivableId, organizationId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => new CollectionActivity(row));
  }

  async findByCustomerId(customerId: string): Promise<CollectionActivity[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { customerId, organizationId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => new CollectionActivity(row));
  }
}
```

`findByReceivableId`/`findByCustomerId` call `this.ormRepo.find` directly (not `scopedFindOne`, which returns only 1 row) — the same pattern as `findByIdForUpdate`/`save` in `TypeOrmReceivableRepository`/`TypeOrmPaymentRepository` (multi-tenancy-rbac plan Task 6-7): use `this.tenantContext.getOrganizationId()` directly because `BaseRepository` does not provide a helper for multi-row queries.

`create()` must call `this.ormRepo.insert()` — do not use `scopedSave()`/`.save()` — so an existing activity ID cannot be upserted or silently modified. Do not add update/delete methods or endpoints.

- [ ] **Step 4: Create `apps/backend/src/modules/collection-activity/collection-activity.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionActivityOrmEntity } from './infrastructure/collection-activity.orm-entity';
import { TypeOrmCollectionActivityRepository } from './infrastructure/typeorm-collection-activity.repository';
import { COLLECTION_ACTIVITY_REPOSITORY } from './application/collection-activity-repository.port';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([CollectionActivityOrmEntity]), ReceivablesModule],
  providers: [
    { provide: COLLECTION_ACTIVITY_REPOSITORY, useClass: TypeOrmCollectionActivityRepository },
  ],
  exports: [COLLECTION_ACTIVITY_REPOSITORY],
})
export class CollectionActivityModule {}
```

`imports: [ReceivablesModule]` is a direct import; `forwardRef()` is not needed — unlike `DisputesModule`/`ReceivablesModule` (which depend on each other), here only `CollectionActivityModule` needs `RECEIVABLE_REPOSITORY` from `ReceivablesModule` (Task 4, to look up `customerId` from `receivableId`), and `ReceivablesModule` needs nothing from this module in return.

- [ ] **Step 5: Register `CollectionActivityModule` in `apps/backend/src/app.module.ts`**

Add `CollectionActivityModule` to the `imports` array (same pattern as every other module registration in the reference plans — alongside `DisputesModule`, which by this point already registered `EventEmitterModule.forRoot()`).

- [ ] **Step 6: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS (no controllers/use cases registered yet, module only exposes the repository)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/collection-activity/infrastructure apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts apps/backend/src/modules/collection-activity/collection-activity.module.ts apps/backend/src/app.module.ts
git commit -m "feat: add CollectionActivity TypeORM entity and BaseRepository-scoped repository"
```

---

### Task 3: `RecordManualActivityUseCase` (manual API for `MANUAL_CALL`/`MANUAL_NOTE`/`PAYMENT_COMMITMENT`)

**Files:**
- Create: `apps/backend/src/modules/collection-activity/application/record-manual-activity.usecase.ts`
- Modify: `apps/backend/src/modules/collection-activity/collection-activity.module.ts`
- Test: `apps/backend/src/modules/collection-activity/application/record-manual-activity.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICollectionActivityRepository` (Task 2), `IReceivableRepository` (to confirm the receivable exists and read its `customerId`), `TenantContextService`
- Produces: `RecordManualActivityUseCase.execute(input)` — used by Task 6 (`CollectionActivityController`)

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/collection-activity/application/record-manual-activity.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../receivables/domain/receivable';
import { CollectionActivityType } from '../domain/collection-activity';
import { RecordManualActivityUseCase } from './record-manual-activity.usecase';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: 'inv-1',
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
  });
}

describe('RecordManualActivityUseCase', () => {
  it('records a MANUAL_CALL activity with the receivable customerId and current org', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new RecordManualActivityUseCase(activityRepo as any, receivableRepo as any, tenantContext as any);

    const activity = await useCase.execute({
      receivableId: 'rec-1',
      activityType: CollectionActivityType.MANUAL_CALL,
      description: 'Called; customer promised to pay next week',
      createdByUserId: 'user-2',
    });

    expect(activity.activityType).toBe(CollectionActivityType.MANUAL_CALL);
    expect(activity.customerId).toBe('cust-1');
    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.MANUAL_CALL,
        createdByUserId: 'user-2',
      }),
    );
  });

  it('throws if the receivable does not exist', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new RecordManualActivityUseCase(activityRepo as any, receivableRepo as any, tenantContext as any);

    await expect(
      useCase.execute({
        receivableId: 'missing',
        activityType: CollectionActivityType.MANUAL_NOTE,
        description: 'x',
        createdByUserId: 'user-2',
      }),
    ).rejects.toThrow('Receivable not found');
    expect(activityRepo.create).not.toHaveBeenCalled();
  });

  it('throws if activityType is not one of MANUAL_CALL/MANUAL_NOTE/PAYMENT_COMMITMENT', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new RecordManualActivityUseCase(activityRepo as any, receivableRepo as any, tenantContext as any);

    await expect(
      useCase.execute({
        receivableId: 'rec-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'x',
        createdByUserId: 'user-2',
      }),
    ).rejects.toThrow('activityType must be one of MANUAL_CALL, MANUAL_NOTE, PAYMENT_COMMITMENT');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test record-manual-activity.usecase.spec.ts`
Expected: FAIL — Cannot find module './record-manual-activity.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/collection-activity/application/record-manual-activity.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CollectionActivity,
  CollectionActivityType,
  MANUAL_ACTIVITY_TYPES,
  ManualActivityType,
} from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface RecordManualActivityInput {
  receivableId: string;
  activityType: ManualActivityType;
  description: string;
  createdByUserId: string;
}

@Injectable()
export class RecordManualActivityUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: RecordManualActivityInput): Promise<CollectionActivity> {
    if (!(MANUAL_ACTIVITY_TYPES as readonly CollectionActivityType[]).includes(input.activityType)) {
      throw new Error(
        `activityType must be one of ${MANUAL_ACTIVITY_TYPES.join(', ')}`,
      );
    }

    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new Error('Receivable not found');
    }

    const activity = new CollectionActivity({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      receivableId: input.receivableId,
      customerId: receivable.customerId,
      activityType: input.activityType,
      description: input.description,
      metadata: {},
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
    });

    await this.activityRepo.create(activity);
    return activity;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test record-manual-activity.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Register `RecordManualActivityUseCase` in `collection-activity.module.ts`**

Modify `apps/backend/src/modules/collection-activity/collection-activity.module.ts` — add `RecordManualActivityUseCase` to `providers`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionActivityOrmEntity } from './infrastructure/collection-activity.orm-entity';
import { TypeOrmCollectionActivityRepository } from './infrastructure/typeorm-collection-activity.repository';
import { COLLECTION_ACTIVITY_REPOSITORY } from './application/collection-activity-repository.port';
import { RecordManualActivityUseCase } from './application/record-manual-activity.usecase';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([CollectionActivityOrmEntity]), ReceivablesModule],
  providers: [
    { provide: COLLECTION_ACTIVITY_REPOSITORY, useClass: TypeOrmCollectionActivityRepository },
    RecordManualActivityUseCase,
  ],
  exports: [COLLECTION_ACTIVITY_REPOSITORY, RecordManualActivityUseCase],
})
export class CollectionActivityModule {}
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/collection-activity
git commit -m "feat: add RecordManualActivityUseCase for MANUAL_CALL/MANUAL_NOTE/PAYMENT_COMMITMENT"
```

---

### Task 4: `CollectionActivityListener` — the single automatic write path

**Files:**
- Create: `apps/backend/src/modules/collection-activity/application/collection-activity.listener.ts`
- Modify: `apps/backend/src/modules/collection-activity/collection-activity.module.ts`
- Test: `apps/backend/src/modules/collection-activity/application/collection-activity.listener.spec.ts`

**Interfaces:**
- Consumes: `ICollectionActivityRepository` (Task 2), `IReceivableRepository`, `TenantContextService` (Role import from `apps/backend/src/modules/organizations/domain/membership.ts`), `EventEmitter2`'s `@OnEvent` decorator from `@nestjs/event-emitter` (already a dependency per dispute-management plan Task 3)
- Produces: automatic `CollectionActivity` rows for `payment.allocated` (→`PAYMENT_RECEIVED`), `receivable.closed` (→`RECEIVABLE_CLOSED`), `dispute.opened`/`dispute.resolved` (→`DISPUTE_OPENED`/`DISPUTE_RESOLVED`), `reminder.sent`/`reminder.failed` (→`EMAIL_SENT`/`EMAIL_FAILED`) — the ONE place any of these events gets turned into a timeline row

`dispute.opened`/`dispute.resolved` payloads (per dispute-management plan Task 3 Step 5/9, this plan's exact documented contract) are `{ disputeId, receivableId, organizationId }` — no `customerId`. `reminder.sent`/`reminder.failed` payloads from the Email Notification plan carry `{ reminderExecutionId, receivableId, organizationId }`. Both cases need a `customerId` lookup via `IReceivableRepository.findById`, which is scoped by `TenantContextService` — since a background reminder worker will NOT run inside the `AsyncLocalStorage` context an HTTP request creates, the listener wraps every such lookup in `tenantContext.run(...)` using the `organizationId` carried in the event payload, so it works whether the listener runs synchronously inside a request (disputes today) or from an out-of-request job.

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/collection-activity/application/collection-activity.listener.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Role } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { CollectionActivityType } from '../domain/collection-activity';
import { CollectionActivityListener } from './collection-activity.listener';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: 'inv-1',
    originalAmount: 50_000_000,
    paidAmount: 50_000_000,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.PAID,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: new Date('2026-08-03'),
  });
}

describe('CollectionActivityListener', () => {
  it('writes a PAYMENT_RECEIVED row on payment.allocated', async () => {
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const receivableRepo = { findById: jest.fn(), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const tenantContext = { run: (_user: unknown, cb: () => unknown) => cb(), getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(activityRepo as any, receivableRepo as any, tenantContext as any);

    await listener.onPaymentAllocated({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-2',
    });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        createdByUserId: 'user-2',
        metadata: { paymentId: 'pay-1', amount: 30_000_000 },
      }),
    );
  });

  it('writes a RECEIVABLE_CLOSED row on receivable.closed', async () => {
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const receivableRepo = { findById: jest.fn(), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const tenantContext = { run: (_user: unknown, cb: () => unknown) => cb(), getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(activityRepo as any, receivableRepo as any, tenantContext as any);

    await listener.onReceivableClosed({ receivableId: 'rec-1', customerId: 'cust-1', organizationId: 'org-1' });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.RECEIVABLE_CLOSED,
        createdByUserId: null,
      }),
    );
  });

  it('resolves customerId via IReceivableRepository (scoped to the event organizationId) on dispute.opened', async () => {
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const runSpy = jest.fn((_user: unknown, cb: () => unknown) => cb());
    const tenantContext = { run: runSpy, getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(activityRepo as any, receivableRepo as any, tenantContext as any);

    await listener.onDisputeOpened({ disputeId: 'dis-1', receivableId: 'rec-1', organizationId: 'org-1' });

    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', role: Role.OWNER }),
      expect.any(Function),
    );
    expect(receivableRepo.findById).toHaveBeenCalledWith('rec-1');
    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.DISPUTE_OPENED,
        metadata: { disputeId: 'dis-1' },
      }),
    );
  });

  it('writes a DISPUTE_RESOLVED row on dispute.resolved', async () => {
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const tenantContext = { run: (_user: unknown, cb: () => unknown) => cb(), getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(activityRepo as any, receivableRepo as any, tenantContext as any);

    await listener.onDisputeResolved({ disputeId: 'dis-1', receivableId: 'rec-1', organizationId: 'org-1' });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: CollectionActivityType.DISPUTE_RESOLVED }),
    );
  });

  it('writes an EMAIL_SENT row on reminder.sent', async () => {
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const tenantContext = { run: (_user: unknown, cb: () => unknown) => cb(), getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(activityRepo as any, receivableRepo as any, tenantContext as any);

    await listener.onReminderSent({ reminderExecutionId: 'rem-1', receivableId: 'rec-1', organizationId: 'org-1' });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: CollectionActivityType.EMAIL_SENT, metadata: { reminderExecutionId: 'rem-1' } }),
    );
  });

  it('writes an EMAIL_FAILED row on reminder.failed', async () => {
    const activityRepo = { create: jest.fn(), findByReceivableId: jest.fn(), findByCustomerId: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const tenantContext = { run: (_user: unknown, cb: () => unknown) => cb(), getOrganizationId: () => 'org-1' };

    const listener = new CollectionActivityListener(activityRepo as any, receivableRepo as any, tenantContext as any);

    await listener.onReminderFailed({ reminderExecutionId: 'rem-2', receivableId: 'rec-1', organizationId: 'org-1' });

    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: CollectionActivityType.EMAIL_FAILED, metadata: { reminderExecutionId: 'rem-2' } }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test collection-activity.listener.spec.ts`
Expected: FAIL — Cannot find module './collection-activity.listener'

- [ ] **Step 3: Create `apps/backend/src/modules/collection-activity/application/collection-activity.listener.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OnEvent } from '@nestjs/event-emitter';
import { CollectionActivity, CollectionActivityType } from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';

export interface PaymentAllocatedEvent {
  paymentId: string;
  receivableId: string;
  customerId: string;
  organizationId: string;
  amount: number;
  allocatedByUserId: string;
}

export interface ReceivableClosedEvent {
  receivableId: string;
  customerId: string;
  organizationId: string;
}

export interface DisputeEvent {
  disputeId: string;
  receivableId: string;
  organizationId: string;
}

export interface ReminderEvent {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
}

@Injectable()
export class CollectionActivityListener {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent('payment.allocated')
  async onPaymentAllocated(payload: PaymentAllocatedEvent): Promise<void> {
    await this.write({
      organizationId: payload.organizationId,
      receivableId: payload.receivableId,
      customerId: payload.customerId,
      activityType: CollectionActivityType.PAYMENT_RECEIVED,
      description: `Received payment of ${payload.amount.toLocaleString('vi-VN')} VND for receivable`,
      metadata: { paymentId: payload.paymentId, amount: payload.amount },
      createdByUserId: payload.allocatedByUserId,
    });
  }

  @OnEvent('receivable.closed')
  async onReceivableClosed(payload: ReceivableClosedEvent): Promise<void> {
    await this.write({
      organizationId: payload.organizationId,
      receivableId: payload.receivableId,
      customerId: payload.customerId,
      activityType: CollectionActivityType.RECEIVABLE_CLOSED,
      description: 'Receivable has been fully paid (PAID)',
      metadata: {},
      createdByUserId: null,
    });
  }

  @OnEvent('dispute.opened')
  async onDisputeOpened(payload: DisputeEvent): Promise<void> {
    const customerId = await this.resolveCustomerId(payload.receivableId, payload.organizationId);
    await this.write({
      organizationId: payload.organizationId,
      receivableId: payload.receivableId,
      customerId,
      activityType: CollectionActivityType.DISPUTE_OPENED,
      description: 'Dispute opened for receivable',
      metadata: { disputeId: payload.disputeId },
      createdByUserId: null,
    });
  }

  @OnEvent('dispute.resolved')
  async onDisputeResolved(payload: DisputeEvent): Promise<void> {
    const customerId = await this.resolveCustomerId(payload.receivableId, payload.organizationId);
    await this.write({
      organizationId: payload.organizationId,
      receivableId: payload.receivableId,
      customerId,
      activityType: CollectionActivityType.DISPUTE_RESOLVED,
      description: 'Dispute resolved',
      metadata: { disputeId: payload.disputeId },
      createdByUserId: null,
    });
  }

  @OnEvent('reminder.sent')
  async onReminderSent(payload: ReminderEvent): Promise<void> {
    const customerId = await this.resolveCustomerId(payload.receivableId, payload.organizationId);
    await this.write({
      organizationId: payload.organizationId,
      receivableId: payload.receivableId,
      customerId,
      activityType: CollectionActivityType.EMAIL_SENT,
      description: 'Payment reminder email sent',
      metadata: { reminderExecutionId: payload.reminderExecutionId },
      createdByUserId: null,
    });
  }

  @OnEvent('reminder.failed')
  async onReminderFailed(payload: ReminderEvent): Promise<void> {
    const customerId = await this.resolveCustomerId(payload.receivableId, payload.organizationId);
    await this.write({
      organizationId: payload.organizationId,
      receivableId: payload.receivableId,
      customerId,
      activityType: CollectionActivityType.EMAIL_FAILED,
      description: 'Payment reminder email failed to send',
      metadata: { reminderExecutionId: payload.reminderExecutionId },
      createdByUserId: null,
    });
  }

  private async resolveCustomerId(receivableId: string, organizationId: string): Promise<string> {
    return this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const receivable = await this.receivableRepo.findById(receivableId);
        if (!receivable) {
          throw new Error(
            `Cannot record collection activity: receivable ${receivableId} not found`,
          );
        }
        return receivable.customerId;
      },
    );
  }

  private async write(input: {
    organizationId: string;
    receivableId: string;
    customerId: string;
    activityType: CollectionActivityType;
    description: string;
    metadata: Record<string, unknown>;
    createdByUserId: string | null;
  }): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId: input.organizationId, role: Role.OWNER },
      async () => {
        await this.activityRepo.create(
          new CollectionActivity({
            id: randomUUID(),
            organizationId: input.organizationId,
            receivableId: input.receivableId,
            customerId: input.customerId,
            activityType: input.activityType,
            description: input.description,
            metadata: input.metadata,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(),
          }),
        );
      },
    );
  }
}
```

`resolveCustomerId` wraps the lookup in `tenantContext.run({ userId: 'system', organizationId: payload.organizationId, role: Role.OWNER }, ...)` instead of calling `receivableRepo.findById` directly — because `payment.allocated`/`receivable.closed` already include `customerId` (Task 5, the use case reads `Receivable` before emitting), while `dispute.*`/`reminder.*` do not. `write()` also opens the same tenant context before calling the repository insert; this keeps both the lookup and activity write safe when the event comes from a BullMQ worker outside the HTTP request lifecycle.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test collection-activity.listener.spec.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Register `CollectionActivityListener` as a provider in `collection-activity.module.ts`**

Modify `apps/backend/src/modules/collection-activity/collection-activity.module.ts` — add `CollectionActivityListener` to `providers`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionActivityOrmEntity } from './infrastructure/collection-activity.orm-entity';
import { TypeOrmCollectionActivityRepository } from './infrastructure/typeorm-collection-activity.repository';
import { COLLECTION_ACTIVITY_REPOSITORY } from './application/collection-activity-repository.port';
import { RecordManualActivityUseCase } from './application/record-manual-activity.usecase';
import { CollectionActivityListener } from './application/collection-activity.listener';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([CollectionActivityOrmEntity]), ReceivablesModule],
  providers: [
    { provide: COLLECTION_ACTIVITY_REPOSITORY, useClass: TypeOrmCollectionActivityRepository },
    RecordManualActivityUseCase,
    CollectionActivityListener,
  ],
  exports: [COLLECTION_ACTIVITY_REPOSITORY, RecordManualActivityUseCase],
})
export class CollectionActivityModule {}
```

`CollectionActivityListener` does not need to be in `exports` — it only registers an `@OnEvent` handler with the global `EventEmitter2` when Nest initializes the provider; no other module needs to inject it directly.

- [ ] **Step 6: Run full test suite and verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/collection-activity
git commit -m "feat: add CollectionActivityListener subscribing to payment/receivable/dispute/reminder events"
```

---

### Task 5: `AllocatePaymentUseCase` — emit `payment.allocated` and `receivable.closed`

**Files:**
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

**Interfaces:**
- Consumes: `EventEmitter2` (`@nestjs/event-emitter`, already installed and globally registered via `EventEmitterModule.forRoot()` by dispute-management plan Task 3)
- Produces: `payment.allocated` event with payload `{ paymentId, receivableId, customerId, organizationId, amount, allocatedByUserId }` (ALWAYS, after a successful allocation) and `receivable.closed` with payload `{ receivableId, customerId, organizationId }` (ONLY when the allocation moved `Receivable.status` to `PAID`) — this is the exact contract `CollectionActivityListener` (Task 4) subscribes to

This is the only place `Receivable.status` transitions to `PAID` today (`Receivable.applyPaymentAllocation`, project-scaffolding-and-domain-core plan Task 9). `2026-08-03-internal-task-escalation.md` ALSO needs to know when a receivable closes for ANY reason (`PAID`/`WRITTEN_OFF`/`CANCELLED`, to auto-dismiss its `InternalTask` rows) — rather than overloading `receivable.closed` (which this plan's spec defines as PAID-only, matching `2026-08-03-collection-activity-timeline-design.md`'s "Receivable.status → PAID" rule exactly), that plan emits a SEPARATE, distinctly-named event `receivable.status-closed` from this same code path (see Step 3 below) plus from `WriteOffReceivableUseCase`/`CancelReceivableUseCase`. The two events are emitted side-by-side here on purpose — same trigger, two audiences, no collision.

**Also note:** `AllocatePaymentInput.allocatedByUserId` is `string | null` (widened by `2026-08-03-webhook-matching-engine.md` Task 9 Step 1 for the `null` = auto-match case) — keep it nullable here; do not narrow it back to `string` when replacing this file.

- [ ] **Step 1: Update the existing unit test to mock `EventEmitter2` and assert both events**

Replace `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { EntityManager } from 'typeorm';
import { AllocatePaymentUseCase } from './allocate-payment.usecase';
import { Receivable } from '../../receivables/domain/receivable';
import { Payment } from '../domain/payment';

describe('AllocatePaymentUseCase', () => {
  function buildReceivable(originalAmount = 50_000_000, paidAmount = 0): Receivable {
    return new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount,
      paidAmount,
      dueDate: new Date('2026-08-20'),
      status: paidAmount > 0 ? ReceivableStatus.PARTIALLY_PAID : ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
    });
  }

  function buildPayment(totalAmount = 30_000_000): Payment {
    return new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      bankTransactionId: null,
      totalAmount,
      allocatedAmount: 0,
      payerName: 'Company B',
      receivedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });
  }

  function buildHarness(receivable: Receivable, payment: Payment) {
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
      findById: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { create: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) => cb({} as EntityManager)),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
      eventEmitter as any,
    );

    return { useCase, receivableRepo, paymentRepo, allocationRepo, eventEmitter };
  }

  it('emits payment.allocated but NOT receivable.closed on a partial allocation', async () => {
    const { useCase, eventEmitter } = buildHarness(buildReceivable(50_000_000, 0), buildPayment(30_000_000));

    await useCase.execute({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
    });

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('payment.allocated', {
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
    });
    expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith('receivable.closed', expect.anything());
  });

  it('emits BOTH payment.allocated and receivable.closed when the allocation fully pays off the receivable', async () => {
    const { useCase, eventEmitter } = buildHarness(buildReceivable(30_000_000, 0), buildPayment(30_000_000));

    await useCase.execute({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
    });

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('payment.allocated', expect.objectContaining({ amount: 30_000_000 }));
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('receivable.closed', {
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
    });
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('receivable.status-closed', {
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });
  });

  it('throws if receivable not found and never emits any event', async () => {
    const receivableRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(null), save: jest.fn(), findById: jest.fn() };
    const paymentRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(buildPayment()), save: jest.fn() };
    const allocationRepo = { create: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) => cb({} as EntityManager)),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await expect(
      useCase.execute({
        paymentId: 'pay-1',
        receivableId: 'missing',
        amount: 1000,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toThrow('Receivable not found');
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test allocate-payment.usecase.spec.ts`
Expected: FAIL — constructor now expects a 6th argument (`eventEmitter`) that doesn't exist on `AllocatePaymentUseCase` yet; `eventEmitter.emit` assertions fail

- [ ] **Step 3: Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`**

Replace its contents:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from './payment-repository.port';
import {
  IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from './payment-allocation-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface AllocatePaymentInput {
  paymentId: string;
  receivableId: string;
  amount: number;
  allocatedByUserId: string | null;
}

@Injectable()
export class AllocatePaymentUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: AllocatePaymentInput): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    let customerId!: string;
    let becameClosed = false;

    await this.dataSource.transaction(async (manager) => {
      const receivable = await this.receivableRepo.findByIdForUpdate(input.receivableId, manager);
      if (!receivable) {
        throw new Error('Receivable not found');
      }

      const payment = await this.paymentRepo.findByIdForUpdate(input.paymentId, manager);
      if (!payment) {
        throw new Error('Payment not found');
      }

      customerId = receivable.customerId;
      const updatedReceivable = receivable.applyPaymentAllocation(input.amount);
      const updatedPayment = payment.withAdditionalAllocation(input.amount);
      becameClosed = updatedReceivable.status === ReceivableStatus.PAID;

      await this.receivableRepo.save(updatedReceivable, manager);
      await this.paymentRepo.save(updatedPayment, manager);
      await this.allocationRepo.create(
        new PaymentAllocation({
          id: randomUUID(),
          organizationId,
          paymentId: input.paymentId,
          receivableId: input.receivableId,
          allocatedAmount: input.amount,
          allocatedAt: new Date(),
          allocatedByUserId: input.allocatedByUserId,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    // Emit only after the transaction has committed successfully — matches the
    // "emit after transaction success" rule established by the dispute-management plan.
    await this.eventEmitter.emitAsync('payment.allocated', {
      paymentId: input.paymentId,
      receivableId: input.receivableId,
      customerId,
      organizationId,
      amount: input.amount,
      allocatedByUserId: input.allocatedByUserId,
    });

    if (becameClosed) {
      await this.eventEmitter.emitAsync('receivable.closed', {
        receivableId: input.receivableId,
        customerId,
        organizationId,
      });
      // Separate, distinctly-named event for 2026-08-03-internal-task-escalation.md's
      // auto-dismiss listener — see the note above Step 1 for why this isn't folded
      // into 'receivable.closed' itself.
      await this.eventEmitter.emitAsync('receivable.status-closed', {
        receivableId: input.receivableId,
        organizationId,
      });
    }
  }
}
```

`emitAsync` (waits for all listeners to finish) is used instead of `emit` (fire-and-forget) for the only 2 events this use case emits directly — so `POST /payments/:id/allocate` returns only after `CollectionActivity` has been written, allowing Task 6's integration test to read the timeline immediately after allocation without waiting or polling. (`dispute.opened`/`dispute.resolved` in the dispute-management plan still use `emit` — see Self-Review Notes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test allocate-payment.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Register `EventEmitter2` availability for `PaymentsModule`**

`EventEmitter2` is provided globally once `EventEmitterModule.forRoot()` is registered in `AppModule` (already done by dispute-management plan) — no change needed to `payments.module.ts`'s `imports`/`providers` beyond what already exists (it already provides `AllocatePaymentUseCase`).

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payments/application/allocate-payment.usecase.ts apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts
git commit -m "feat: emit payment.allocated and receivable.closed from AllocatePaymentUseCase"
```

---

### Task 6: Read use cases + `CollectionActivityController`

**Files:**
- Create: `apps/backend/src/modules/collection-activity/application/get-receivable-timeline.usecase.ts`
- Create: `apps/backend/src/modules/collection-activity/application/get-customer-timeline.usecase.ts`
- Create: `apps/backend/src/modules/collection-activity/presentation/dto/create-manual-activity.dto.ts`
- Create: `apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.ts`
- Modify: `apps/backend/src/modules/collection-activity/collection-activity.module.ts`
- Test: `apps/backend/src/modules/collection-activity/application/get-receivable-timeline.usecase.spec.ts`
- Test: `apps/backend/src/modules/collection-activity/application/get-customer-timeline.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICollectionActivityRepository` (Task 2), `RecordManualActivityUseCase` (Task 3), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`/`Permission` (`apps/backend/src/common/auth/jwt-auth.guard.ts`, `.../rbac/permission.guard.ts`, `.../require-permission.decorator.ts`, `.../permission.enum.ts` — multi-tenancy-rbac plan Task 4/8), `TenantContextService`
- Produces: `POST /receivables/:id/activities`, `GET /receivables/:id/timeline`, `GET /customers/:id/timeline` — used by Task 7 integration test

- [ ] **Step 1: Write failing tests for the two read use cases**

Create `apps/backend/src/modules/collection-activity/application/get-receivable-timeline.usecase.spec.ts`:

```typescript
import { CollectionActivity, CollectionActivityType } from '../domain/collection-activity';
import { GetReceivableTimelineUseCase } from './get-receivable-timeline.usecase';

describe('GetReceivableTimelineUseCase', () => {
  it('returns activities for the receivable, ordered as the repository provides them', async () => {
    const activities = [
      new CollectionActivity({
        id: 'act-2',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.RECEIVABLE_CLOSED,
        description: 'x',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03T10:00:00Z'),
      }),
      new CollectionActivity({
        id: 'act-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'y',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03T09:00:00Z'),
      }),
    ];
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn().mockResolvedValue(activities),
      findByCustomerId: jest.fn(),
    };

    const useCase = new GetReceivableTimelineUseCase(activityRepo as any);
    const result = await useCase.execute('rec-1');

    expect(result).toBe(activities);
    expect(activityRepo.findByReceivableId).toHaveBeenCalledWith('rec-1');
  });
});
```

Create `apps/backend/src/modules/collection-activity/application/get-customer-timeline.usecase.spec.ts`:

```typescript
import { CollectionActivity, CollectionActivityType } from '../domain/collection-activity';
import { GetCustomerTimelineUseCase } from './get-customer-timeline.usecase';

describe('GetCustomerTimelineUseCase', () => {
  it('returns activities across all receivables for the customer', async () => {
    const activities = [
      new CollectionActivity({
        id: 'act-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'x',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03'),
      }),
    ];
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn().mockResolvedValue(activities),
    };

    const useCase = new GetCustomerTimelineUseCase(activityRepo as any);
    const result = await useCase.execute('cust-1');

    expect(result).toBe(activities);
    expect(activityRepo.findByCustomerId).toHaveBeenCalledWith('cust-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test get-receivable-timeline.usecase.spec.ts get-customer-timeline.usecase.spec.ts`
Expected: FAIL — both modules not found

- [ ] **Step 3: Create the two use cases**

`apps/backend/src/modules/collection-activity/application/get-receivable-timeline.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CollectionActivity } from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';

@Injectable()
export class GetReceivableTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(receivableId: string): Promise<CollectionActivity[]> {
    return this.activityRepo.findByReceivableId(receivableId);
  }
}
```

`apps/backend/src/modules/collection-activity/application/get-customer-timeline.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CollectionActivity } from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';

@Injectable()
export class GetCustomerTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(customerId: string): Promise<CollectionActivity[]> {
    return this.activityRepo.findByCustomerId(customerId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test get-receivable-timeline.usecase.spec.ts get-customer-timeline.usecase.spec.ts`
Expected: both PASS

- [ ] **Step 5: Create `apps/backend/src/modules/collection-activity/presentation/dto/create-manual-activity.dto.ts`**

```typescript
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { CollectionActivityType, MANUAL_ACTIVITY_TYPES } from '../../domain/collection-activity';

export class CreateManualActivityDto {
  @IsIn(MANUAL_ACTIVITY_TYPES)
  activityType: CollectionActivityType.MANUAL_CALL | CollectionActivityType.MANUAL_NOTE | CollectionActivityType.PAYMENT_COMMITMENT;

  @IsString()
  @IsNotEmpty()
  description: string;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RecordManualActivityUseCase } from '../application/record-manual-activity.usecase';
import { GetReceivableTimelineUseCase } from '../application/get-receivable-timeline.usecase';
import { GetCustomerTimelineUseCase } from '../application/get-customer-timeline.usecase';
import { CreateManualActivityDto } from './dto/create-manual-activity.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CollectionActivityController {
  constructor(
    private readonly recordManualActivityUseCase: RecordManualActivityUseCase,
    private readonly getReceivableTimelineUseCase: GetReceivableTimelineUseCase,
    private readonly getCustomerTimelineUseCase: GetCustomerTimelineUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('receivables/:id/activities')
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async createManual(@Param('id') receivableId: string, @Body() dto: CreateManualActivityDto) {
    const currentUser = this.tenantContext.getCurrentUser();
    return this.recordManualActivityUseCase.execute({
      receivableId,
      activityType: dto.activityType,
      description: dto.description,
      createdByUserId: currentUser!.userId,
    });
  }

  @Get('receivables/:id/timeline')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async receivableTimeline(@Param('id') receivableId: string) {
    return this.getReceivableTimelineUseCase.execute(receivableId);
  }

  @Get('customers/:id/timeline')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async customerTimeline(@Param('id') customerId: string) {
    return this.getCustomerTimelineUseCase.execute(customerId);
  }
}
```

There are no PATCH/DELETE routes on this controller — matching collection-activity-timeline spec section 4 ("INSERT only; no PATCH/DELETE endpoints").

- [ ] **Step 7: Register everything in `collection-activity.module.ts`**

Replace `apps/backend/src/modules/collection-activity/collection-activity.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionActivityOrmEntity } from './infrastructure/collection-activity.orm-entity';
import { TypeOrmCollectionActivityRepository } from './infrastructure/typeorm-collection-activity.repository';
import { COLLECTION_ACTIVITY_REPOSITORY } from './application/collection-activity-repository.port';
import { RecordManualActivityUseCase } from './application/record-manual-activity.usecase';
import { GetReceivableTimelineUseCase } from './application/get-receivable-timeline.usecase';
import { GetCustomerTimelineUseCase } from './application/get-customer-timeline.usecase';
import { CollectionActivityListener } from './application/collection-activity.listener';
import { CollectionActivityController } from './presentation/collection-activity.controller';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([CollectionActivityOrmEntity]), ReceivablesModule],
  controllers: [CollectionActivityController],
  providers: [
    { provide: COLLECTION_ACTIVITY_REPOSITORY, useClass: TypeOrmCollectionActivityRepository },
    RecordManualActivityUseCase,
    GetReceivableTimelineUseCase,
    GetCustomerTimelineUseCase,
    CollectionActivityListener,
  ],
  exports: [COLLECTION_ACTIVITY_REPOSITORY],
})
export class CollectionActivityModule {}
```

- [ ] **Step 8: Run full test suite and verify app boots**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/collection-activity
git commit -m "feat: add CollectionActivityController with manual-write and timeline-read endpoints"
```

---

### Task 7: Integration test — payment allocation closes a receivable, both activities show up in the timeline

**Files:**
- Create: `apps/backend/test/collection-activity-timeline.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-6, plus `JwtAuthGuard`/`PermissionGuard`/`TenantContextService` from multi-tenancy-rbac plan, `AllocatePaymentUseCase` from Task 5), real Postgres via testcontainers
- Produces: verified end-to-end proof that allocating a payment which closes a `Receivable` produces BOTH a `PAYMENT_RECEIVED` and a `RECEIVABLE_CLOSED` `CollectionActivity` row, retrievable via both timeline endpoints

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/collection-activity-timeline.integration.spec.ts`:

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
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';

describe('Collection Activity Timeline (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-00000000000a';
  const customerId = '00000000-0000-0000-0000-0000000000c1';
  const receivableId = '00000000-0000-0000-0000-0000000000r1';
  const paymentId = '00000000-0000-0000-0000-0000000000p1';
  const userId = '00000000-0000-0000-0000-0000000000u1';

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
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
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
      salesRepresentativeId: userId,
      createdAt: new Date(),
      closedAt: null,
    });

    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      bankTransactionId: null,
      totalAmount: 30_000_000,
      allocatedAmount: 0,
      payerName: 'Company B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function authHeader(): string {
    // FINANCE_MANAGER has PAYMENT_ALLOCATE and RECEIVABLE_READ per ROLE_PERMISSIONS (multi-tenancy-rbac plan Task 8)
    return `Bearer ${jwtService.sign({ userId, organizationId, role: 'FINANCE_MANAGER' })}`;
  }

  it('allocating a payment that fully closes a Receivable produces PAYMENT_RECEIVED and RECEIVABLE_CLOSED rows retrievable via both timeline endpoints', async () => {
    // 1. Allocate the full amount — receivable originalAmount === payment totalAmount, so it closes to PAID
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', authHeader())
      .send({ receivableId, amount: 30_000_000 })
      .expect(201, { success: true });

    // 2. GET /receivables/:id/timeline shows BOTH activity rows
    const receivableTimelineRes = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}/timeline`)
      .set('Authorization', authHeader())
      .expect(200);

    const receivableActivityTypes = receivableTimelineRes.body.map((a: { activityType: string }) => a.activityType);
    expect(receivableActivityTypes).toEqual(
      expect.arrayContaining(['PAYMENT_RECEIVED', 'RECEIVABLE_CLOSED']),
    );
    expect(receivableTimelineRes.body).toHaveLength(2);
    for (const activity of receivableTimelineRes.body) {
      expect(activity.receivableId).toBe(receivableId);
      expect(activity.customerId).toBe(customerId);
    }

    // 3. GET /customers/:id/timeline shows the same two rows (denormalized, no UNION needed)
    const customerTimelineRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/timeline`)
      .set('Authorization', authHeader())
      .expect(200);

    const customerActivityTypes = customerTimelineRes.body.map((a: { activityType: string }) => a.activityType);
    expect(customerActivityTypes).toEqual(
      expect.arrayContaining(['PAYMENT_RECEIVED', 'RECEIVABLE_CLOSED']),
    );

    // 4. Confirm the receivable itself really is PAID (sanity check on the source of truth)
    const receivableRow = await dataSource.query('SELECT status FROM receivables WHERE id = $1', [receivableId]);
    expect(receivableRow[0].status).toBe('PAID');
  });

  it('records a manual MANUAL_CALL activity via POST /receivables/:id/activities', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/activities`)
      .set('Authorization', authHeader())
       .send({ activityType: 'MANUAL_CALL', description: 'Called to confirm full payment was received' })
      .expect(201);

    expect(res.body.activityType).toBe('MANUAL_CALL');
    expect(res.body.createdByUserId).toBe(userId);

    const timelineRes = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}/timeline`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(timelineRes.body).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- collection-activity-timeline.integration.spec.ts`
Expected: PASS — proves the full loop: allocate payment (fully closing the receivable) → `PAYMENT_RECEIVED` + `RECEIVABLE_CLOSED` rows exist → both retrievable via `GET /receivables/:id/timeline` and `GET /customers/:id/timeline` → manual activity API adds a 3rd row

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/collection-activity-timeline.integration.spec.ts
git commit -m "test: add integration test proving payment allocation writes PAYMENT_RECEIVED + RECEIVABLE_CLOSED activities"
```

---

## Self-Review Notes

- **Spec coverage:** `CollectionActivity` entity (collection-activity-timeline spec section 1) → Task 1-2. Automatic event-driven writes (section 2.1) → Task 4 (`CollectionActivityListener`) + Task 5 (`AllocatePaymentUseCase` emits `payment.allocated`/`receivable.closed`, the only two events this plan controls end-to-end). Manual API (section 2.2) → Task 3 + Task 6 (`POST /receivables/:id/activities`). INSERT-only, no PATCH/DELETE (section 4) → Task 2 uses TypeORM `insert()` rather than `save()`, while `CollectionActivityController` exposes no PATCH/DELETE routes and the domain class has no mutating methods.
- **Single write path enforced:** every automatic row is written by exactly one class, `CollectionActivityListener` (Task 4) — no other service calls `ICollectionActivityRepository.create` except `RecordManualActivityUseCase` (Task 3) for the 3 manual types. `AllocatePaymentUseCase`, `OpenDisputeUseCase`/`ResolveDisputeUseCase` (dispute-management plan) never touch `CollectionActivity` directly, only emit domain events — matching spec section 2.1's explicit requirement.
- **`EventEmitterModule` ownership:** confirmed by reading `2026-08-03-dispute-management.md` Task 3 Step 2 — it already registers `EventEmitterModule.forRoot()` in `AppModule` and adds `@nestjs/event-emitter` to `package.json`. This plan does neither again; it only imports `EventEmitter2`/`@OnEvent`, which are already available. If this plan is executed before the dispute-management plan for some reason, `EventEmitterModule.forRoot()` must be added first — flagged here so whoever executes out of order doesn't skip it.
- **`payment.allocated`/`receivable.closed` contract (this plan's own, end-to-end controlled):** emitted only from `AllocatePaymentUseCase.execute()`, only after `dataSource.transaction(...)` resolves, via `eventEmitter.emitAsync(...)` (awaited) rather than `.emit()` (fire-and-forget) — this makes `POST /payments/:id/allocate`'s response only return after the `CollectionActivity` row(s) are already persisted, which is what makes Task 7's integration test deterministic without polling/sleep. `receivable.closed` only fires when `updatedReceivable.status === ReceivableStatus.PAID` right after the allocation — since `applyPaymentAllocation` is the only place `Receivable.status` becomes `PAID` today (project-scaffolding-and-domain-core plan Task 9), no other hook point exists or is needed.
- **`dispute.opened`/`dispute.resolved` contract (owned by dispute-management plan, consumed here as-is):** payload is `{ disputeId, receivableId, organizationId }` per that plan's Task 3 Steps 5/9 and its own Self-Review Notes, which explicitly names this plan as the intended listener and confirms the emitting use cases call plain `.emit()` (not `emitAsync`). That means a dispute's `CollectionActivity` row may be written a tick after the HTTP response to `POST /receivables/:id/disputes`/`POST /disputes/:id/resolve` returns — acceptable given the design spec's own open question section 5 ("synchronous or asynchronous... with a small delay" is explicitly left open, not blocking). This plan's own integration test (Task 7) only exercises the `payment.allocated`/`receivable.closed` path it fully controls, to stay deterministic; it does not assert timing for dispute-triggered rows.
- **`reminder.sent`/`reminder.failed` contract:** owned by the Email Notification plan and consumed here as `{ reminderExecutionId, receivableId, organizationId }`. The contract is now implemented, not a speculative forward reference. The `tenantContext.run(...)` wrapper remains required because the email worker has no HTTP `AsyncLocalStorage` context.
- **Permission reuse, no new permission added:** `Permission.RECEIVABLE_READ` gates both `GET /receivables/:id/timeline` and `GET /customers/:id/timeline` (per this plan's own instructions — reusing the existing read permission rather than adding e.g. `Permission.COLLECTION_ACTIVITY_READ`). `Permission.RECEIVABLE_WRITE` gates `POST /receivables/:id/activities` — this is a judgment call this plan makes (not explicitly dictated), reasoned as: recording a manual call/note/commitment is a write action tied to a receivable, and every role that can write a receivable (`FINANCE_MANAGER`, `ACCOUNTANT` per `ROLE_PERMISSIONS`) plausibly needs to log collection activity too, while `SALES_REP`/`VIEWER` (read-only) should not. If product wants a narrower permission later, add `Permission.COLLECTION_ACTIVITY_WRITE` to the enum and swap the one `@RequirePermission` call in `collection-activity.controller.ts` — no other change needed.
- **No circular module dependency:** unlike `ReceivablesModule ↔ DisputesModule` (which need `forwardRef()`), `CollectionActivityModule` only depends one-way on `ReceivablesModule` (for `RECEIVABLE_REPOSITORY`, used to resolve `customerId` for dispute/reminder events and to validate the receivable exists in `RecordManualActivityUseCase`). `ReceivablesModule` has no dependency back on `CollectionActivityModule`, so a plain `imports: [ReceivablesModule]` suffices.
- **Type consistency checked:** `ICollectionActivityRepository.create`/`findByReceivableId`/`findByCustomerId` signatures match their usage in `RecordManualActivityUseCase`, `CollectionActivityListener`, `GetReceivableTimelineUseCase`, `GetCustomerTimelineUseCase`, and their mocks across all `.spec.ts` files in this plan. `AllocatePaymentUseCase`'s constructor now takes 6 args (`receivableRepo, paymentRepo, allocationRepo, dataSource, tenantContext, eventEmitter`) — Task 5 Step 1 updates the existing spec file to match; any other test file constructing `AllocatePaymentUseCase` directly (none exist outside this plan and the two plans it builds on) would need the same update. `PaymentAllocatedEvent`/`ReceivableClosedEvent`/`DisputeEvent`/`ReminderEvent` payload field names are identical between the emitting code (`AllocatePaymentUseCase`, dispute-management plan's use cases) and the listener's handler signatures. Every listener call reaches `write()`, which reopens the event tenant context before the insert.
- **Not covered in this plan (by design):** UI for the timeline display (design spec section 4, out of scope — original doc section 18, Receivable Detail). `INVOICE_CREATED` activity type exists in the enum (per spec section 1) but no listener wires it up yet — no plan read so far emits an `invoice.created` event; adding that hook is a one-line `@OnEvent('invoice.created')` handler in `CollectionActivityListener` once such an event exists, following the exact same pattern as every other handler in Task 4. Rate-limiting/deduping repeated manual activity submissions — not requested by the spec, YAGNI until observed as a real problem.


