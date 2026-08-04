# Dispute Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `Dispute` as a separate entity/module (`apps/backend/src/modules/disputes/`), following the 4-layer Clean Architecture used by every other module in Domain Core. `Receivable.isDisputed` is **not** a field stored in the DB — it is always computed at query time using an open-dispute lookup, with `disputeId` added to the response at the presentation layer of `ReceivablesController` (endpoint `GET /receivables/:id` — did not exist before this plan, added in Task 5). Opening a dispute does not change `Receivable.status` — the matching flow (`AllocatePaymentUseCase`) is unaffected. Each open/resolve emits an `EventEmitter2` event (`dispute.opened`/`dispute.resolved`) for the Collection Activity Timeline plan (written in parallel and independent of this plan) to listen to.

**Architecture:** The `disputes` module is independent (domain/application/infrastructure/presentation), reusing `BaseRepository`/`TenantContextService` (from the multi-tenancy-rbac plan) and `Permission.RECEIVABLE_DISPUTE` (already present in the `Permission` enum; no new permission added). `ReceivablesModule` and `DisputesModule` depend on each other (Receivables needs `DISPUTE_REPOSITORY` to compute `isDisputed`; Disputes needs `RECEIVABLE_REPOSITORY` to confirm the receivable exists before opening a dispute) — resolved with NestJS's standard `forwardRef()`, with no need for another intermediary module.

**Tech Stack:** Inherits the unchanged tech stack from project-scaffolding-and-domain-core.md and multi-tenancy-rbac.md (NestJS 10, TypeORM 0.3, Postgres 16, Jest + testcontainers + supertest). New addition: `@nestjs/event-emitter` for the `dispute.opened`/`dispute.resolved` domain events.

## Global Constraints

- `domain/dispute.ts` imports nothing from NestJS/TypeORM (preserving the project's Clean Architecture principle).
- `isDisputed` is **never** a stored column in the `receivables` or `disputes` tables — it is always the `EXISTS(...)` result computed at query time (dispute-management spec sections 1 and 3).
- Opening a dispute (`OpenDisputeUseCase`) **does not** call `Receivable.writeOff()`/`cancel()` or change `status` — it only creates a new `Dispute` record (dispute-management spec section 2).
- A `Receivable` may have multiple `Dispute` records over time (full history) — there is no limit of 1 dispute/receivable, only a limit of at most 1 dispute with `OPEN` status at a time (enforced at the use-case layer, not by a DB constraint, because the MVP does not need a unique index yet — if stricter enforcement is needed, add a partial unique index `(receivableId) WHERE status='OPEN'` later).
- Naming follows the project: `DisputeOrmEntity`, `IDisputeRepository`, DI token `DISPUTE_REPOSITORY`, use cases `OpenDisputeUseCase`/`ResolveDisputeUseCase` (specified names; do not change them).
- Reuse the existing `Permission.RECEIVABLE_DISPUTE` in `apps/backend/src/common/rbac/permission.enum.ts` (multi-tenancy-rbac plan Task 8) — do not add a new permission for open/resolve.
- All read/write endpoints go through `@UseGuards(JwtAuthGuard, PermissionGuard)` + `@RequirePermission(...)`, like the existing `ReceivablesController`/`PaymentsController`.
- The `dispute.opened`/`dispute.resolved` events are emitted **only after** a successful save (not if the use case throws beforehand) — matching the "emit event after the transaction succeeds" principle in collection-activity-timeline spec section 2.1.

---

## File Structure

```
apps/backend/
  package.json                                              -- MODIFY: add @nestjs/event-emitter
  src/
    app.module.ts                                            -- MODIFY: register EventEmitterModule + DisputesModule
    modules/
      disputes/
        domain/
          dispute.ts                                         -- NEW: Dispute domain class + DisputeStatus enum
        application/
          dispute-repository.port.ts                         -- NEW: IDisputeRepository, DISPUTE_REPOSITORY
          open-dispute.usecase.ts                             -- NEW: OpenDisputeUseCase
          resolve-dispute.usecase.ts                          -- NEW: ResolveDisputeUseCase
        infrastructure/
          dispute.orm-entity.ts                               -- NEW: DisputeOrmEntity
          typeorm-dispute.repository.ts                       -- NEW: TypeOrmDisputeRepository extends BaseRepository
        presentation/
          dto/open-dispute.dto.ts                             -- NEW: OpenDisputeDto
          disputes.controller.ts                              -- NEW: POST /receivables/:receivableId/disputes, POST /disputes/:id/resolve
        disputes.module.ts                                    -- NEW: DisputesModule (forwardRef -> ReceivablesModule)
      receivables/
        application/
          get-receivable.usecase.ts                           -- NEW: GetReceivableUseCase (attaches isDisputed)
        presentation/
          receivables.controller.ts                           -- MODIFY: add GET /receivables/:id
        receivables.module.ts                                 -- MODIFY: forwardRef -> DisputesModule, register GetReceivableUseCase
  test/
    dispute-lifecycle.integration.spec.ts                     -- NEW: testcontainers + supertest end-to-end proof
```

---

### Task 1: Dispute domain entity

**Files:**
- Create: `apps/backend/src/modules/disputes/domain/dispute.ts`
- Test: `apps/backend/src/modules/disputes/domain/dispute.spec.ts`

**Interfaces:**
- Consumes: nothing (plain domain class, no framework import — same pattern as `Invoice`/`Payment`)
- Produces: `Dispute` domain class with `resolve()`, `DisputeStatus` enum — used by Task 2 (ORM entity), Task 3 (use cases)

- [ ] **Step 1: Write failing domain tests**

Create `apps/backend/src/modules/disputes/domain/dispute.spec.ts`:

```typescript
import { Dispute, DisputeStatus } from './dispute';

function buildOpenDispute(): Dispute {
  return new Dispute({
    id: 'dis-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    reason: 'The customer believes the invoice amount is incorrect',
    status: DisputeStatus.OPEN,
    openedByUserId: 'user-1',
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-01'),
  });
}

describe('Dispute domain entity', () => {
  it('creates an OPEN dispute with resolvedByUserId/resolvedAt null', () => {
    const dispute = buildOpenDispute();

    expect(dispute.status).toBe(DisputeStatus.OPEN);
    expect(dispute.resolvedByUserId).toBeNull();
    expect(dispute.resolvedAt).toBeNull();
  });

  it('resolves an OPEN dispute, setting resolvedByUserId and resolvedAt', () => {
    const dispute = buildOpenDispute();
    const resolved = dispute.resolve('user-2');

    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(resolved.resolvedByUserId).toBe('user-2');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    // original instance is untouched (immutable pattern, same as Receivable)
    expect(dispute.status).toBe(DisputeStatus.OPEN);
  });

  it('throws when resolving a dispute that is already RESOLVED', () => {
    const resolved = buildOpenDispute().resolve('user-2');

    expect(() => resolved.resolve('user-3')).toThrow(
      'Cannot resolve a dispute that is not OPEN',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test dispute.spec.ts`
Expected: FAIL — Cannot find module './dispute'

- [ ] **Step 3: Create `apps/backend/src/modules/disputes/domain/dispute.ts`**

```typescript
export enum DisputeStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

export interface DisputeProps {
  id: string;
  organizationId: string;
  receivableId: string;
  reason: string;
  status: DisputeStatus;
  openedByUserId: string;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export class Dispute {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly reason: string;
  readonly status: DisputeStatus;
  readonly openedByUserId: string;
  readonly resolvedByUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: DisputeProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.receivableId = props.receivableId;
    this.reason = props.reason;
    this.status = props.status;
    this.openedByUserId = props.openedByUserId;
    this.resolvedByUserId = props.resolvedByUserId;
    this.resolvedAt = props.resolvedAt;
    this.createdAt = props.createdAt;
  }

  resolve(resolvedByUserId: string): Dispute {
    if (this.status !== DisputeStatus.OPEN) {
      throw new Error('Cannot resolve a dispute that is not OPEN');
    }
    return new Dispute({
      ...this,
      status: DisputeStatus.RESOLVED,
      resolvedByUserId,
      resolvedAt: new Date(),
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test dispute.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/disputes/domain
git commit -m "feat: add Dispute domain entity with resolve() state transition"
```

---

### Task 2: Dispute infrastructure — ORM entity + repository (BaseRepository-scoped)

**Files:**
- Create: `apps/backend/src/modules/disputes/infrastructure/dispute.orm-entity.ts`
- Create: `apps/backend/src/modules/disputes/application/dispute-repository.port.ts`
- Create: `apps/backend/src/modules/disputes/infrastructure/typeorm-dispute.repository.ts`
- Create: `apps/backend/src/modules/disputes/disputes.module.ts`

**Interfaces:**
- Consumes: `Dispute` domain class (Task 1), `BaseRepository`/`TenantContextService` (`apps/backend/src/common/tenancy/base.repository.ts`, `.../tenant-context.ts` — already implemented by multi-tenancy-rbac plan Task 5)
- Produces: `IDisputeRepository` with `findById`, `findOpenDispute`, `hasOpenDispute`, `save` — `findOpenDispute` supplies `disputeId` for receivable detail reads, while `hasOpenDispute` is the boolean primitive used by reminder reads

- [ ] **Step 1: Create `apps/backend/src/modules/disputes/infrastructure/dispute.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DisputeStatus } from '../domain/dispute';

@Entity({ name: 'disputes' })
@Index(['receivableId', 'status'])
export class DisputeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column()
  reason: string;

  @Column({ type: 'enum', enum: DisputeStatus })
  status: DisputeStatus;

  @Column()
  openedByUserId: string;

  @Column({ nullable: true })
  resolvedByUserId: string | null;

  @Column({ nullable: true })
  resolvedAt: Date | null;

  @Column()
  createdAt: Date;
}
```

`@Index(['receivableId', 'status'])` exists because `hasOpenDispute` runs on every `GET /receivables/:id` — it needs a fast lookup by `(receivableId, status='OPEN')` instead of a full scan of the `disputes` table.

- [ ] **Step 2: Create `apps/backend/src/modules/disputes/application/dispute-repository.port.ts`**

```typescript
import { Dispute } from '../domain/dispute';

export interface IDisputeRepository {
  findById(id: string): Promise<Dispute | null>;
  findOpenDispute(receivableId: string): Promise<Dispute | null>;
  hasOpenDispute(receivableId: string): Promise<boolean>;
  save(dispute: Dispute): Promise<void>;
}

export const DISPUTE_REPOSITORY = Symbol('DISPUTE_REPOSITORY');
```

`hasOpenDispute(receivableId): Promise<boolean>` implements `Receivable.isDisputed = EXISTS(Dispute WHERE receivableId=X AND status='OPEN')` from dispute-management spec section 1 — the `isDisputed` field is stored nowhere; every read queries the `disputes` table again.

- [ ] **Step 3: Create `apps/backend/src/modules/disputes/infrastructure/typeorm-dispute.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, DisputeStatus } from '../domain/dispute';
import { IDisputeRepository } from '../application/dispute-repository.port';
import { DisputeOrmEntity } from './dispute.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmDisputeRepository extends BaseRepository<DisputeOrmEntity> implements IDisputeRepository {
  constructor(
    @InjectRepository(DisputeOrmEntity) repo: Repository<DisputeOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Dispute | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new Dispute(row) : null;
  }

  async hasOpenDispute(receivableId: string): Promise<boolean> {
    return (await this.findOpenDispute(receivableId)) !== null;
  }

  async findOpenDispute(receivableId: string): Promise<Dispute | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { receivableId, organizationId, status: DisputeStatus.OPEN },
    });
    return row ? new Dispute(row) : null;
  }

  async save(dispute: Dispute): Promise<void> {
    await this.scopedSave(dispute as unknown as DisputeOrmEntity);
  }
}
```

- [ ] **Step 4: Create `apps/backend/src/modules/disputes/disputes.module.ts`**

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeOrmEntity } from './infrastructure/dispute.orm-entity';
import { TypeOrmDisputeRepository } from './infrastructure/typeorm-dispute.repository';
import { DISPUTE_REPOSITORY } from './application/dispute-repository.port';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([DisputeOrmEntity]), forwardRef(() => ReceivablesModule)],
  providers: [{ provide: DISPUTE_REPOSITORY, useClass: TypeOrmDisputeRepository }],
  exports: [DISPUTE_REPOSITORY],
})
export class DisputesModule {}
```

`forwardRef(() => ReceivablesModule)` is required: `DisputesModule` needs `RECEIVABLE_REPOSITORY` (Task 3, `OpenDisputeUseCase` confirms the receivable exists before opening a dispute), while `ReceivablesModule` needs `DISPUTE_REPOSITORY` (Task 5, `GetReceivableUseCase` computes `isDisputed`) — the two modules depend on each other, so NestJS requires `forwardRef()` on both sides to break the cycle while resolving the dependency graph.

- [ ] **Step 5: Register `DisputesModule` in `apps/backend/src/app.module.ts`**

Add `DisputesModule` to the `imports` array (same pattern as every other module registration in the reference plans).

- [ ] **Step 6: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS (no controllers/use cases registered yet, module only exposes the repository — this step just confirms the `forwardRef` wiring doesn't throw a circular-dependency error at boot)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/disputes/infrastructure apps/backend/src/modules/disputes/application/dispute-repository.port.ts apps/backend/src/modules/disputes/disputes.module.ts apps/backend/src/app.module.ts
git commit -m "feat: add Dispute TypeORM entity and BaseRepository-scoped repository"
```

---

### Task 3: OpenDisputeUseCase and ResolveDisputeUseCase (emit domain events)

**Files:**
- Create: `apps/backend/src/modules/disputes/application/open-dispute.usecase.ts`
- Create: `apps/backend/src/modules/disputes/application/resolve-dispute.usecase.ts`
- Modify: `apps/backend/src/modules/disputes/disputes.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/package.json`
- Test: `apps/backend/src/modules/disputes/application/open-dispute.usecase.spec.ts`
- Test: `apps/backend/src/modules/disputes/application/resolve-dispute.usecase.spec.ts`

**Interfaces:**
- Consumes: `IDisputeRepository` (Task 2), `IReceivableRepository` (`apps/backend/src/modules/receivables/application/receivable-repository.port.ts`, already migrated to the no-`organizationId`-param signature by multi-tenancy-rbac plan Task 6), `TenantContextService`, `EventEmitter2`
- Produces: `dispute.opened` / `dispute.resolved` events with payload `{ disputeId, receivableId, organizationId }` — **this is the exact contract the Collection Activity Timeline plan's listener must subscribe to** (see Self-Review Notes)

- [ ] **Step 1: Install `@nestjs/event-emitter`**

Run: `pnpm --filter @casso-ledger/backend add @nestjs/event-emitter`

Add to `apps/backend/package.json` `dependencies`:
```json
"@nestjs/event-emitter": "2.1.1"
```

- [ ] **Step 2: Wire `EventEmitterModule.forRoot()` into `apps/backend/src/app.module.ts`**

Add the import and register it once, globally, in the root `AppModule` imports array (alongside `ConfigModule.forRoot`, `TypeOrmModule.forRoot`, etc. from earlier plans):

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
```

```typescript
imports: [
  // ...existing imports from project-scaffolding and multi-tenancy-rbac plans...
  EventEmitterModule.forRoot(),
  DisputesModule,
],
```

- [ ] **Step 3: Write failing test for `OpenDisputeUseCase`**

Create `apps/backend/src/modules/disputes/application/open-dispute.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../receivables/domain/receivable';
import { DisputeStatus } from '../domain/dispute';
import { OpenDisputeUseCase } from './open-dispute.usecase';

function buildOpenReceivable(): Receivable {
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

describe('OpenDisputeUseCase', () => {
  it('opens a dispute for an existing receivable without changing its status, and emits dispute.opened', async () => {
    const receivable = buildOpenReceivable();
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(receivable),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const disputeRepo = { findById: jest.fn(), hasOpenDispute: jest.fn(), save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn() };

    const useCase = new OpenDisputeUseCase(
      disputeRepo as any,
      receivableRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    const dispute = await useCase.execute({
      receivableId: 'rec-1',
      reason: 'The customer disagrees with the invoice amount',
      openedByUserId: 'user-2',
    });

    expect(dispute.status).toBe(DisputeStatus.OPEN);
    expect(receivableRepo.save).not.toHaveBeenCalled();
    expect(disputeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ receivableId: 'rec-1', status: DisputeStatus.OPEN, openedByUserId: 'user-2' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith('dispute.opened', {
      disputeId: dispute.id,
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });
  });

  it('throws if the receivable does not exist', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const disputeRepo = { findById: jest.fn(), hasOpenDispute: jest.fn(), save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn() };

    const useCase = new OpenDisputeUseCase(
      disputeRepo as any,
      receivableRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await expect(
      useCase.execute({ receivableId: 'missing', reason: 'x', openedByUserId: 'user-2' }),
    ).rejects.toThrow('Receivable not found');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('rejects a second OPEN dispute for the same receivable', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildOpenReceivable()), save: jest.fn() };
    const disputeRepo = { findById: jest.fn(), hasOpenDispute: jest.fn().mockResolvedValue(true), save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn() };
    const useCase = new OpenDisputeUseCase(
      disputeRepo as any,
      receivableRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await expect(
      useCase.execute({ receivableId: 'rec-1', reason: 'duplicate', openedByUserId: 'user-2' }),
    ).rejects.toThrow('Receivable already has an OPEN dispute');
    expect(disputeRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test open-dispute.usecase.spec.ts`
Expected: FAIL — Cannot find module './open-dispute.usecase'

- [ ] **Step 5: Create `apps/backend/src/modules/disputes/application/open-dispute.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DISPUTE_REPOSITORY, IDisputeRepository } from './dispute-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Dispute, DisputeStatus } from '../domain/dispute';

export interface OpenDisputeInput {
  receivableId: string;
  reason: string;
  openedByUserId: string;
}

@Injectable()
export class OpenDisputeUseCase {
  constructor(
    @Inject(DISPUTE_REPOSITORY) private readonly disputeRepo: IDisputeRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: OpenDisputeInput): Promise<Dispute> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new Error('Receivable not found');
    }

    if (await this.disputeRepo.hasOpenDispute(input.receivableId)) {
      throw new Error('Receivable already has an OPEN dispute');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const dispute = new Dispute({
      id: randomUUID(),
      organizationId,
      receivableId: input.receivableId,
      reason: input.reason,
      status: DisputeStatus.OPEN,
      openedByUserId: input.openedByUserId,
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt: new Date(),
    });

    await this.disputeRepo.save(dispute);

    this.eventEmitter.emit('dispute.opened', {
      disputeId: dispute.id,
      receivableId: dispute.receivableId,
      organizationId,
    });

    return dispute;
  }
}
```

 Note: this use case **does not** call `receivable.writeOff()`/`.cancel()` or `receivableRepo.save(...)` — `Receivable.status` remains unchanged (dispute-management spec section 2, "Resolving a Dispute ... requires no other manual action," implies that the receivable status is completely independent of the dispute lifecycle).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test open-dispute.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 7: Write failing test for `ResolveDisputeUseCase`**

Create `apps/backend/src/modules/disputes/application/resolve-dispute.usecase.spec.ts`:

```typescript
import { Dispute, DisputeStatus } from '../domain/dispute';
import { ResolveDisputeUseCase } from './resolve-dispute.usecase';

function buildOpenDispute(): Dispute {
  return new Dispute({
    id: 'dis-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
       reason: 'reason',
    status: DisputeStatus.OPEN,
    openedByUserId: 'user-2',
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-01'),
  });
}

describe('ResolveDisputeUseCase', () => {
  it('resolves an OPEN dispute and emits dispute.resolved', async () => {
    const dispute = buildOpenDispute();
    const disputeRepo = { findById: jest.fn().mockResolvedValue(dispute), hasOpenDispute: jest.fn(), save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn() };

    const useCase = new ResolveDisputeUseCase(disputeRepo as any, tenantContext as any, eventEmitter as any);
    const resolved = await useCase.execute({ disputeId: 'dis-1', resolvedByUserId: 'user-3' });

    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(disputeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DisputeStatus.RESOLVED, resolvedByUserId: 'user-3' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith('dispute.resolved', {
      disputeId: 'dis-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });
  });

  it('throws if the dispute does not exist', async () => {
    const disputeRepo = { findById: jest.fn().mockResolvedValue(null), hasOpenDispute: jest.fn(), save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventEmitter = { emit: jest.fn() };

    const useCase = new ResolveDisputeUseCase(disputeRepo as any, tenantContext as any, eventEmitter as any);

    await expect(
      useCase.execute({ disputeId: 'missing', resolvedByUserId: 'user-3' }),
    ).rejects.toThrow('Dispute not found');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test resolve-dispute.usecase.spec.ts`
Expected: FAIL — Cannot find module './resolve-dispute.usecase'

- [ ] **Step 9: Create `apps/backend/src/modules/disputes/application/resolve-dispute.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DISPUTE_REPOSITORY, IDisputeRepository } from './dispute-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Dispute } from '../domain/dispute';

export interface ResolveDisputeInput {
  disputeId: string;
  resolvedByUserId: string;
}

@Injectable()
export class ResolveDisputeUseCase {
  constructor(
    @Inject(DISPUTE_REPOSITORY) private readonly disputeRepo: IDisputeRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: ResolveDisputeInput): Promise<Dispute> {
    const dispute = await this.disputeRepo.findById(input.disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    const resolved = dispute.resolve(input.resolvedByUserId);
    await this.disputeRepo.save(resolved);

    this.eventEmitter.emit('dispute.resolved', {
      disputeId: resolved.id,
      receivableId: resolved.receivableId,
      organizationId: this.tenantContext.getOrganizationId(),
    });

    return resolved;
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test resolve-dispute.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 11: Register both use cases as providers in `disputes.module.ts`**

Modify `apps/backend/src/modules/disputes/disputes.module.ts` — add `OpenDisputeUseCase` and `ResolveDisputeUseCase` to `providers`:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeOrmEntity } from './infrastructure/dispute.orm-entity';
import { TypeOrmDisputeRepository } from './infrastructure/typeorm-dispute.repository';
import { DISPUTE_REPOSITORY } from './application/dispute-repository.port';
import { OpenDisputeUseCase } from './application/open-dispute.usecase';
import { ResolveDisputeUseCase } from './application/resolve-dispute.usecase';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([DisputeOrmEntity]), forwardRef(() => ReceivablesModule)],
  providers: [
    { provide: DISPUTE_REPOSITORY, useClass: TypeOrmDisputeRepository },
    OpenDisputeUseCase,
    ResolveDisputeUseCase,
  ],
  exports: [DISPUTE_REPOSITORY, OpenDisputeUseCase, ResolveDisputeUseCase],
})
export class DisputesModule {}
```

- [ ] **Step 12: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/modules/disputes apps/backend/src/app.module.ts apps/backend/package.json
git commit -m "feat: add OpenDisputeUseCase and ResolveDisputeUseCase emitting dispute.opened/dispute.resolved"
```

---

### Task 4: DisputesController — HTTP endpoints

**Files:**
- Create: `apps/backend/src/modules/disputes/presentation/dto/open-dispute.dto.ts`
- Create: `apps/backend/src/modules/disputes/presentation/disputes.controller.ts`
- Modify: `apps/backend/src/modules/disputes/disputes.module.ts`

**Interfaces:**
- Consumes: `OpenDisputeUseCase`/`ResolveDisputeUseCase` (Task 3), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission` (`apps/backend/src/common/auth/jwt-auth.guard.ts`, `apps/backend/src/common/rbac/permission.guard.ts`, `.../require-permission.decorator.ts` — already implemented by multi-tenancy-rbac plan Task 4/8), `Permission.RECEIVABLE_DISPUTE` (already in `permission.enum.ts`, not re-declared here)
- Produces: `POST /receivables/:receivableId/disputes`, `POST /disputes/:id/resolve` — used by Task 6 integration test

- [ ] **Step 1: Create `apps/backend/src/modules/disputes/presentation/dto/open-dispute.dto.ts`**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class OpenDisputeDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/disputes/presentation/disputes.controller.ts`**

```typescript
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OpenDisputeUseCase } from '../application/open-dispute.usecase';
import { ResolveDisputeUseCase } from '../application/resolve-dispute.usecase';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DisputesController {
  constructor(
    private readonly openDisputeUseCase: OpenDisputeUseCase,
    private readonly resolveDisputeUseCase: ResolveDisputeUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('receivables/:receivableId/disputes')
  @RequirePermission(Permission.RECEIVABLE_DISPUTE)
  async open(@Param('receivableId') receivableId: string, @Body() dto: OpenDisputeDto) {
    const currentUser = this.tenantContext.getCurrentUser();
    return this.openDisputeUseCase.execute({
      receivableId,
      reason: dto.reason,
      openedByUserId: currentUser!.userId,
    });
  }

  @Post('disputes/:id/resolve')
  @RequirePermission(Permission.RECEIVABLE_DISPUTE)
  async resolve(@Param('id') id: string) {
    const currentUser = this.tenantContext.getCurrentUser();
    return this.resolveDisputeUseCase.execute({
      disputeId: id,
      resolvedByUserId: currentUser!.userId,
    });
  }
}
```

`openedByUserId`/`resolvedByUserId` come from `TenantContextService.getCurrentUser()` (JWT authenticated through `JwtAuthGuard`) instead of the request body — preventing the client from claiming an arbitrary user ID, consistent with `AllocatePaymentUseCase`/`CreateReceivableUseCase` after migration in the multi-tenancy-rbac plan, which also no longer accept `organizationId` from the body and instead take it from the authenticated context.

- [ ] **Step 3: Register `DisputesController` in `disputes.module.ts`**

Modify `apps/backend/src/modules/disputes/disputes.module.ts` — add `controllers: [DisputesController]`:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeOrmEntity } from './infrastructure/dispute.orm-entity';
import { TypeOrmDisputeRepository } from './infrastructure/typeorm-dispute.repository';
import { DISPUTE_REPOSITORY } from './application/dispute-repository.port';
import { OpenDisputeUseCase } from './application/open-dispute.usecase';
import { ResolveDisputeUseCase } from './application/resolve-dispute.usecase';
import { DisputesController } from './presentation/disputes.controller';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [TypeOrmModule.forFeature([DisputeOrmEntity]), forwardRef(() => ReceivablesModule)],
  controllers: [DisputesController],
  providers: [
    { provide: DISPUTE_REPOSITORY, useClass: TypeOrmDisputeRepository },
    OpenDisputeUseCase,
    ResolveDisputeUseCase,
  ],
  exports: [DISPUTE_REPOSITORY, OpenDisputeUseCase, ResolveDisputeUseCase],
})
export class DisputesModule {}
```

- [ ] **Step 4: Verify app boots with the new controller**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/disputes/presentation apps/backend/src/modules/disputes/disputes.module.ts
git commit -m "feat: add DisputesController with open/resolve endpoints gated by RECEIVABLE_DISPUTE permission"
```

---

### Task 5: GetReceivableUseCase — attach computed `isDisputed` on read

**Files:**
- Create: `apps/backend/src/modules/receivables/application/get-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`
- Test: `apps/backend/src/modules/receivables/application/get-receivable.usecase.spec.ts`

**Interfaces:**
- Consumes: `IReceivableRepository` (existing), `IDisputeRepository.hasOpenDispute` (Task 2) via `forwardRef(() => DisputesModule)` in `ReceivablesModule`
- Produces: `GET /receivables/:id` returning `{ ...receivable, isDisputed: boolean, disputeId: string | null }` — the endpoint did not exist before this plan (flagged as a gap in multi-tenancy-rbac plan's Self-Review Notes); consumed by Task 6 integration test

This is the concrete implementation of the retroactive change from `2026-08-03-domain-core-design.md` section 3 → `2026-08-03-dispute-management-design.md` section 3: `Receivable` never gains an `isDisputed` field on the domain class or ORM entity. Instead, the read path (`GetReceivableUseCase`) queries `IDisputeRepository` separately and merges the result at the presentation boundary.

- [ ] **Step 1: Write failing test for `GetReceivableUseCase`**

Create `apps/backend/src/modules/receivables/application/get-receivable.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../domain/receivable';
import { GetReceivableUseCase } from './get-receivable.usecase';

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

describe('GetReceivableUseCase', () => {
  it('returns the receivable with isDisputed=true when an OPEN dispute exists', async () => {
    const receivable = buildReceivable();
    const receivableRepo = { findById: jest.fn().mockResolvedValue(receivable), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const disputeRepo = { findById: jest.fn(), findOpenDispute: jest.fn().mockResolvedValue({ id: 'dispute-1' }), hasOpenDispute: jest.fn(), save: jest.fn() };

    const useCase = new GetReceivableUseCase(receivableRepo as any, disputeRepo as any);
    const result = await useCase.execute('rec-1');

    expect(result.isDisputed).toBe(true);
    expect(result.disputeId).toBe('dispute-1');
    expect(result.receivable.status).toBe(ReceivableStatus.OPEN);
    expect(disputeRepo.findOpenDispute).toHaveBeenCalledWith('rec-1');
  });

  it('returns isDisputed=false when no OPEN dispute exists', async () => {
    const receivable = buildReceivable();
    const receivableRepo = { findById: jest.fn().mockResolvedValue(receivable), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const disputeRepo = { findById: jest.fn(), findOpenDispute: jest.fn().mockResolvedValue(null), hasOpenDispute: jest.fn(), save: jest.fn() };

    const useCase = new GetReceivableUseCase(receivableRepo as any, disputeRepo as any);
    const result = await useCase.execute('rec-1');

    expect(result.isDisputed).toBe(false);
    expect(result.disputeId).toBeNull();
  });

  it('throws if the receivable does not exist', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const disputeRepo = { findById: jest.fn(), findOpenDispute: jest.fn(), hasOpenDispute: jest.fn(), save: jest.fn() };

    const useCase = new GetReceivableUseCase(receivableRepo as any, disputeRepo as any);
    await expect(useCase.execute('missing')).rejects.toThrow('Receivable not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test get-receivable.usecase.spec.ts`
Expected: FAIL — Cannot find module './get-receivable.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/receivables/application/get-receivable.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { IDisputeRepository, DISPUTE_REPOSITORY } from '../../disputes/application/dispute-repository.port';
import { Receivable } from '../domain/receivable';

export interface ReceivableWithDisputeStatus {
  receivable: Receivable;
  isDisputed: boolean;
  disputeId: string | null;
}

@Injectable()
export class GetReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(DISPUTE_REPOSITORY) private readonly disputeRepo: IDisputeRepository,
  ) {}

  async execute(id: string): Promise<ReceivableWithDisputeStatus> {
    const receivable = await this.receivableRepo.findById(id);
    if (!receivable) {
      throw new Error('Receivable not found');
    }

    const openDispute = await this.disputeRepo.findOpenDispute(id);
    return {
      receivable,
      isDisputed: openDispute !== null,
      disputeId: openDispute?.id ?? null,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test get-receivable.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Add `GET /receivables/:id` to `receivables.controller.ts`**

Replace contents of `apps/backend/src/modules/receivables/presentation/receivables.controller.ts` (adds the new endpoint alongside the existing `create`/`writeOff` routes from the reference plans):

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { GetReceivableUseCase } from '../application/get-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('receivables')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
    private readonly getReceivableUseCase: GetReceivableUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async create(@Body() dto: CreateReceivableDto) {
    return this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId,
    });
  }

  @Get(':id')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async findOne(@Param('id') id: string) {
    const { receivable, isDisputed, disputeId } = await this.getReceivableUseCase.execute(id);
    return { ...receivable, isDisputed, disputeId };
  }

  @Post(':id/write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  async writeOff(@Param('id') id: string) {
    return this.writeOffReceivableUseCase.execute(id);
  }
}
```

`{ ...receivable, isDisputed, disputeId }` spreads a plain object containing all `Receivable` fields plus two read-only dispute fields — the response JSON has `isDisputed`/`disputeId` but there is no `isDisputed` column in `receivables`.

- [ ] **Step 6: Register `GetReceivableUseCase` and `forwardRef(() => DisputesModule)` in `receivables.module.ts`**

Replace contents of `apps/backend/src/modules/receivables/receivables.module.ts`:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivableOrmEntity } from './infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from './infrastructure/typeorm-receivable.repository';
import { RECEIVABLE_REPOSITORY } from './application/receivable-repository.port';
import { CreateReceivableUseCase } from './application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from './application/write-off-receivable.usecase';
import { GetReceivableUseCase } from './application/get-receivable.usecase';
import { ReceivablesController } from './presentation/receivables.controller';
import { DisputesModule } from '../disputes/disputes.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReceivableOrmEntity]), forwardRef(() => DisputesModule)],
  controllers: [ReceivablesController],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
    CreateReceivableUseCase,
    WriteOffReceivableUseCase,
    GetReceivableUseCase,
  ],
  exports: [RECEIVABLE_REPOSITORY, TypeOrmModule],
})
export class ReceivablesModule {}
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 8: Verify app boots (circular module reference resolves correctly)**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS — confirms `forwardRef` on both `ReceivablesModule` ↔ `DisputesModule` resolves without a "Nest can't resolve dependencies" or circular-instantiation error

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/receivables apps/backend/src/modules/disputes/disputes.module.ts
git commit -m "feat: add GET /receivables/:id returning computed isDisputed via IDisputeRepository"
```

---

### Task 6: Integration test — full dispute lifecycle (testcontainers + supertest)

**Files:**
- Create: `apps/backend/test/dispute-lifecycle.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-5, plus `JwtAuthGuard`/`PermissionGuard`/`TenantContextService` from multi-tenancy-rbac plan), real Postgres via testcontainers
- Produces: verified end-to-end proof that open dispute → `GET` shows `isDisputed=true` with `Receivable.status` unchanged → resolve dispute → `isDisputed=false`

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/dispute-lifecycle.integration.spec.ts`:

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

describe('Dispute lifecycle (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-00000000000a';
  const customerId = '00000000-0000-0000-0000-0000000000c1';
  const receivableId = '00000000-0000-0000-0000-0000000000r1';
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
      originalAmount: 50_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: userId,
      createdAt: new Date(),
      closedAt: null,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function authHeader(): string {
    // FINANCE_MANAGER has RECEIVABLE_DISPUTE and RECEIVABLE_READ per ROLE_PERMISSIONS (multi-tenancy-rbac plan Task 8)
    return `Bearer ${jwtService.sign({ userId, organizationId, role: 'FINANCE_MANAGER' })}`;
  }

  it('opens a dispute, shows isDisputed=true with status unchanged, then resolves it back to isDisputed=false', async () => {
    // 1. Open a dispute
    const openRes = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/disputes`)
      .set('Authorization', authHeader())
       .send({ reason: 'The customer disagrees with the invoice amount' })
      .expect(201);

    const disputeId = openRes.body.id;
    expect(openRes.body.status).toBe('OPEN');

    // 2. GET receivable shows isDisputed=true, status unchanged (still OPEN)
    const afterOpenRes = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(afterOpenRes.body.isDisputed).toBe(true);
    expect(afterOpenRes.body.status).toBe('OPEN');

    // 3. Resolve the dispute
    await request(app.getHttpServer())
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', authHeader())
      .expect(201);

    // 4. GET receivable shows isDisputed=false again
    const afterResolveRes = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(afterResolveRes.body.isDisputed).toBe(false);
    expect(afterResolveRes.body.status).toBe('OPEN');

    const disputeRow = await dataSource.query('SELECT status FROM disputes WHERE id = $1', [disputeId]);
    expect(disputeRow[0].status).toBe('RESOLVED');
  });
});
```

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- dispute-lifecycle.integration.spec.ts`
Expected: PASS — proves the full loop: open dispute → `isDisputed=true` + `status` unchanged → resolve → `isDisputed=false`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/dispute-lifecycle.integration.spec.ts
git commit -m "test: add integration test for full dispute lifecycle (open -> isDisputed -> resolve)"
```

---

## Self-Review Notes

- **Spec coverage:** `Dispute` entity (dispute-management spec section 1) → Task 1-2. Lifecycle open/resolve (section 2) → Task 3-4. Computed `isDisputed` never stored, retroactive change to domain-core spec section 3 → Task 5 (`GetReceivableUseCase` + `IDisputeRepository.hasOpenDispute`, no field added to `Receivable`/`ReceivableOrmEntity`). RBAC reuse (`Permission.RECEIVABLE_DISPUTE`, already defined by multi-tenancy-rbac plan Task 8) → Task 4, no new permission added.
- **MVP field set:** `assignedToUserId` and `resolutionNote` are intentionally deferred; the spec now records the same simplification. Add them only with a follow-up migration when the workflow is defined.
- **Circular module dependency:** `ReceivablesModule` and `DisputesModule` depend on each other (Receivables needs `DISPUTE_REPOSITORY` for `isDisputed`; Disputes needs `RECEIVABLE_REPOSITORY` to validate the receivable exists before opening a dispute). Resolved with `forwardRef()` on both sides (Task 2 Step 4, Task 5 Step 6) — the standard NestJS pattern for this exact shape of dependency, not a new abstraction.
- **Contract for Collection Activity Timeline plan (written in parallel, per the design spec's dependency note):** `OpenDisputeUseCase`/`ResolveDisputeUseCase` emit NestJS `EventEmitter2` events named exactly `dispute.opened` and `dispute.resolved`, with payload shape `{ disputeId: string, receivableId: string, organizationId: string }` (Task 3, Steps 5 and 9). Events fire only after `disputeRepo.save()` succeeds — never on the `Receivable not found`/`Dispute not found` error paths. The Timeline plan's listener should subscribe via `@OnEvent('dispute.opened')`/`@OnEvent('dispute.resolved')` and write `CollectionActivity` rows with `activityType: 'DISPUTE_OPENED'`/`'DISPUTE_RESOLVED'`, using `payload.receivableId` to look up `customerId` (not included in the event payload — the listener already has read access to `Receivable` via `RECEIVABLE_REPOSITORY`).
- **Contract for Reminder Automation plan (referenced by the design spec but out of scope here):** `IDisputeRepository.hasOpenDispute(receivableId): Promise<boolean>` (Task 2) is the exact primitive that plan needs to skip sending reminders for disputed receivables — no new method should be needed on this repository for that purpose.
- **Type consistency checked:** `IDisputeRepository.findOpenDispute` supplies the exact open row for `GetReceivableUseCase` (Task 5), while `hasOpenDispute` remains the boolean primitive used by reminder reads. `OpenDisputeInput`/`ResolveDisputeInput` field names (`receivableId`, `reason`, `openedByUserId` / `disputeId`, `resolvedByUserId`) match exactly between the use case, its unit test, and the controller's `execute()` calls in Task 4. `Dispute.resolve()` throw message (`'Cannot resolve a dispute that is not OPEN'`) is asserted identically in both `dispute.spec.ts` (Task 1) and left untouched by `ResolveDisputeUseCase` (Task 3), which does not catch or rewrap it.
- **Not covered in this plan (by design):** UI for the dispute detail screen (design spec section 4, out of scope — original doc sections 7.12/18). Deadline/escalation tracking for unresolved disputes (design spec section 4, belongs to a future Internal Task/Escalation spec). Assignment/resolution-note fields and any tighter resolve permission model remain deferred; today any role with `Permission.RECEIVABLE_DISPUTE` (`OWNER`, `FINANCE_MANAGER`, `ACCOUNTANT` per `ROLE_PERMISSIONS`) can resolve any dispute in their organization.


