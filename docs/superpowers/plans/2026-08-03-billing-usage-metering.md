# Billing + Usage Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement plan/subscription usage limits for the 2 MVP-gated metrics — receivables created per month and active bank connections — by counting directly from the `receivables`/`bank_connections` tables at write-time (no separate usage-tracking table), and hard-block `POST /receivables` and the Cas ID token-exchange endpoint with a clear 402 error prompting an upgrade when the organization's `Subscription` limit is exceeded.

**Architecture:** A `Subscription` entity (one active row per organization) carries `receivableMonthlyLimit`/`bankConnectionLimit` directly (no separate `Plan` catalog table at MVP — `planId` is just a label). `PlanLimitService.assertReceivableQuotaAvailable(organizationId, manager)` / `assertBankConnectionQuotaAvailable(organizationId, manager)` load the active `Subscription`, take a Postgres advisory transaction lock keyed by `organizationId` (via `pg_advisory_xact_lock`), `COUNT(*)` the relevant table, and throw `PlanLimitExceededException` (HTTP 402) if the count is at or above the limit. `CreateReceivableUseCase` and `ExchangeTokenUseCase` wrap the check-then-insert in the same DB transaction so two concurrent requests cannot both slip past the limit; the active `EntityManager` is passed through every repository write. Authentication owns creation of the default FREE subscription during signup.

**Tech Stack:** TypeORM (`DataSource.transaction`, `EntityManager.count`, raw `pg_advisory_xact_lock` query), NestJS, builds on `Domain Core`, `Multi-tenancy & RBAC`, and `Cas ID Bank Connection` plans' entities/repositories.

## Global Constraints

- No `UsageRecord`/`UsageAggregate` table for these 2 metrics — counts come straight from `receivables`/`bank_connections` filtered by `organizationId` (and `createdAt` period / `status='ACTIVE'`), per spec mục 2.
- Hard block only: exceeding the limit rejects the write with a clear message; no silent overage, no overage billing (spec mục 4, out of scope).
- Race safety: the count-check and the insert/status-flip happen in the same DB transaction, serialized per-organization via `pg_advisory_xact_lock`, per spec mục 3.
- Upgrade/downgrade flows are out of scope. Signup provisioning is owned by the Authentication & Onboarding plan and must create one `ACTIVE/FREE` row before the first quota-gated write. The integration test may seed a row only as fixture setup, not as the production provisioning path.
- File/class naming and layer dependency rules from `2026-08-03-project-scaffolding-architecture-design.md` (domain has no framework imports; presentation → application → domain).
- Reuse `Permission.SUBSCRIPTION_MANAGE` (already defined in `2026-08-03-multi-tenancy-rbac.md` Task 8) — no new Permission enum values needed since this plan adds no new write endpoint of its own.

---

## File Structure

```
apps/backend/src/
  modules/
    billing/
      domain/subscription.ts
      domain/subscription.spec.ts
      infrastructure/subscription.orm-entity.ts
      application/subscription-repository.port.ts
      infrastructure/typeorm-subscription.repository.ts
      application/plan-limit-exceeded.exception.ts
      application/plan-limit.service.ts
      application/plan-limit.service.spec.ts
      billing.module.ts
    receivables/
      application/create-receivable.usecase.ts               -- MODIFY: inject PlanLimitService + DataSource
      application/create-receivable.usecase.spec.ts           -- MODIFY: assert quota check + transaction
      receivables.module.ts                                   -- MODIFY: import BillingModule
    bank-connections/
      application/bank-connection-repository.port.ts          -- MODIFY: save() accepts optional EntityManager
      infrastructure/typeorm-bank-connection.repository.ts    -- MODIFY: save() uses manager when provided
      application/exchange-token.usecase.ts                   -- MODIFY: inject PlanLimitService + DataSource
      application/exchange-token.usecase.spec.ts              -- MODIFY: assert quota check + transaction
      bank-connections.module.ts                               -- MODIFY: import BillingModule
  app.module.ts                                                -- MODIFY: register BillingModule
test/
  billing/receivable-quota.integration.spec.ts
```

---

### Task 1: `Subscription` domain entity

**Files:**
- Create: `apps/backend/src/modules/billing/domain/subscription.ts`
- Test: `apps/backend/src/modules/billing/domain/subscription.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Subscription`, `PlanId`, `SubscriptionStatus` — used by every later task in this plan

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/billing/domain/subscription.spec.ts`:

```typescript
import { Subscription } from './subscription';

describe('Subscription domain entity', () => {
  function buildSubscription(overrides: Partial<ConstructorParameters<typeof Subscription>[0]> = {}) {
    return new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: 'FREE',
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-08-31T23:59:59.999Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    });
  }

  it('is active when status is ACTIVE', () => {
    const subscription = buildSubscription({ status: 'ACTIVE' });
    expect(subscription.isActive()).toBe(true);
  });

  it('is not active when status is PAST_DUE or CANCELLED', () => {
    expect(buildSubscription({ status: 'PAST_DUE' }).isActive()).toBe(false);
    expect(buildSubscription({ status: 'CANCELLED' }).isActive()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test subscription.spec.ts`
Expected: FAIL — Cannot find module './subscription'

- [ ] **Step 3: Create `apps/backend/src/modules/billing/domain/subscription.ts`**

```typescript
export type PlanId = 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

export interface SubscriptionProps {
  id: string;
  organizationId: string;
  planId: PlanId;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
}

export class Subscription {
  readonly id: string;
  readonly organizationId: string;
  readonly planId: PlanId;
  readonly receivableMonthlyLimit: number;
  readonly bankConnectionLimit: number;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly createdAt: Date;

  constructor(props: SubscriptionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.planId = props.planId;
    this.receivableMonthlyLimit = props.receivableMonthlyLimit;
    this.bankConnectionLimit = props.bankConnectionLimit;
    this.status = props.status;
    this.currentPeriodStart = props.currentPeriodStart;
    this.currentPeriodEnd = props.currentPeriodEnd;
    this.createdAt = props.createdAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test subscription.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/domain
git commit -m "feat: add Subscription domain entity"
```

---

### Task 2: `Subscription` infrastructure + `BillingModule` skeleton

**Files:**
- Create: `apps/backend/src/modules/billing/infrastructure/subscription.orm-entity.ts`
- Create: `apps/backend/src/modules/billing/application/subscription-repository.port.ts`
- Create: `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts`
- Create: `apps/backend/src/modules/billing/billing.module.ts`

**Interfaces:**
- Consumes: `Subscription` domain class (Task 1)
- Produces: `ISubscriptionRepository.findActiveByOrganizationId(organizationId, manager)`, used by Task 3 (`PlanLimitService`)

- [ ] **Step 1: Create `apps/backend/src/modules/billing/infrastructure/subscription.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PlanId, SubscriptionStatus } from '../domain/subscription';

@Entity({ name: 'subscriptions' })
@Index(['organizationId'], { unique: true })
export class SubscriptionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  planId: PlanId;

  @Column('int')
  receivableMonthlyLimit: number;

  @Column('int')
  bankConnectionLimit: number;

  @Column()
  status: SubscriptionStatus;

  @Column()
  currentPeriodStart: Date;

  @Column()
  currentPeriodEnd: Date;

  @Column()
  createdAt: Date;
}
```

One row per organization at MVP (`@Index` unique) — plan upgrade/downgrade updates this row in place rather than inserting a new one; history of past periods is out of scope (spec mục 4).

- [ ] **Step 2: Create `apps/backend/src/modules/billing/application/subscription-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { Subscription } from '../domain/subscription';

export interface ISubscriptionRepository {
  findActiveByOrganizationId(organizationId: string, manager: EntityManager): Promise<Subscription | null>;
  save(subscription: Subscription, manager?: EntityManager): Promise<void>;
}

export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');
```

- [ ] **Step 3: Create `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Subscription } from '../domain/subscription';
import { ISubscriptionRepository } from '../application/subscription-repository.port';
import { SubscriptionOrmEntity } from './subscription.orm-entity';

@Injectable()
export class TypeOrmSubscriptionRepository implements ISubscriptionRepository {
  constructor(
    @InjectRepository(SubscriptionOrmEntity)
    private readonly repo: Repository<SubscriptionOrmEntity>,
  ) {}

  async findActiveByOrganizationId(organizationId: string, manager: EntityManager): Promise<Subscription | null> {
    const row = await manager.getRepository(SubscriptionOrmEntity).findOne({ where: { organizationId, status: 'ACTIVE' } });
    return row ? new Subscription(row) : null;
  }

  async save(subscription: Subscription, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(SubscriptionOrmEntity) : this.repo).save(
      subscription as unknown as SubscriptionOrmEntity,
    );
  }
}
```

`findActiveByOrganizationId` takes the explicit `organizationId` and active transaction `EntityManager`; it must never fall back to the module-scoped repository because the subscription read participates in the same quota lock transaction.

- [ ] **Step 4: Create `apps/backend/src/modules/billing/billing.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionOrmEntity } from './infrastructure/subscription.orm-entity';
import { TypeOrmSubscriptionRepository } from './infrastructure/typeorm-subscription.repository';
import { SUBSCRIPTION_REPOSITORY } from './application/subscription-repository.port';
import { PlanLimitService } from './application/plan-limit.service';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionOrmEntity])],
  providers: [
    { provide: SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    PlanLimitService,
  ],
  exports: [SUBSCRIPTION_REPOSITORY, PlanLimitService],
})
export class BillingModule {}
```

(`PlanLimitService` is created in Task 3 — this module file is finalized once that file exists; Nest resolves the import at compile time so create Task 3's file before running the app.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/infrastructure apps/backend/src/modules/billing/application/subscription-repository.port.ts apps/backend/src/modules/billing/billing.module.ts
git commit -m "feat: add Subscription repository and BillingModule skeleton"
```

---

### Task 3: `PlanLimitExceededException` + `PlanLimitService`

**Files:**
- Create: `apps/backend/src/modules/billing/application/plan-limit-exceeded.exception.ts`
- Create: `apps/backend/src/modules/billing/application/plan-limit.service.ts`
- Test: `apps/backend/src/modules/billing/application/plan-limit.service.spec.ts`

**Interfaces:**
- Consumes: `ISubscriptionRepository` (Task 2), `ReceivableOrmEntity` (from `2026-08-03-project-scaffolding-and-domain-core.md`), `BankConnectionOrmEntity` (from `2026-08-03-cas-id-bank-connection.md`)
- Produces: `PlanLimitService.assertReceivableQuotaAvailable(organizationId, manager)` / `assertBankConnectionQuotaAvailable(organizationId, manager)`, used by Task 4 (`CreateReceivableUseCase`) and Task 5 (`ExchangeTokenUseCase`)

- [ ] **Step 1: Create `apps/backend/src/modules/billing/application/plan-limit-exceeded.exception.ts`**

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

export class PlanLimitExceededException extends HttpException {
  constructor(message: string) {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, message }, HttpStatus.PAYMENT_REQUIRED);
  }
}
```

`HttpStatus.PAYMENT_REQUIRED` is 402, matching spec mục 3's `"402 'Đã đạt giới hạn gói {planName}, nâng cấp để tiếp tục'"`.

- [ ] **Step 2: Write failing unit test for `PlanLimitService`**

Create `apps/backend/src/modules/billing/application/plan-limit.service.spec.ts`:

```typescript
import { Subscription } from '../domain/subscription';
import { PlanLimitService } from './plan-limit.service';
import { PlanLimitExceededException } from './plan-limit-exceeded.exception';

function buildSubscription(overrides: Partial<ConstructorParameters<typeof Subscription>[0]> = {}) {
  return new Subscription({
    id: 'sub-1',
    organizationId: 'org-1',
    planId: 'FREE',
    receivableMonthlyLimit: 1,
    bankConnectionLimit: 1,
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-08-31T23:59:59.999Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  });
}

function buildManager(count: number) {
  return {
    query: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(count),
  };
}

describe('PlanLimitService', () => {
  describe('assertReceivableQuotaAvailable', () => {
    it('does not throw when the count is below the limit', async () => {
      const subscriptionRepo = { findActiveByOrganizationId: jest.fn().mockResolvedValue(buildSubscription()), save: jest.fn() };
      const manager = buildManager(0);
      const service = new PlanLimitService(subscriptionRepo as any);

      await expect(service.assertReceivableQuotaAvailable('org-1', manager as any)).resolves.toBeUndefined();
      expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1, hashtext($2))', [1, 'org-1']);
      expect(subscriptionRepo.findActiveByOrganizationId).toHaveBeenCalledWith('org-1', manager);
    });

    it('throws PlanLimitExceededException when the count is at the limit', async () => {
      const subscriptionRepo = { findActiveByOrganizationId: jest.fn().mockResolvedValue(buildSubscription({ receivableMonthlyLimit: 1 })), save: jest.fn() };
      const manager = buildManager(1);
      const service = new PlanLimitService(subscriptionRepo as any);

      await expect(service.assertReceivableQuotaAvailable('org-1', manager as any)).rejects.toThrow(
        PlanLimitExceededException,
      );
    });

    it('throws PlanLimitExceededException when the organization has no active subscription', async () => {
      const subscriptionRepo = { findActiveByOrganizationId: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const manager = buildManager(0);
      const service = new PlanLimitService(subscriptionRepo as any);

      await expect(service.assertReceivableQuotaAvailable('org-1', manager as any)).rejects.toThrow(
        PlanLimitExceededException,
      );
    });
  });

  describe('assertBankConnectionQuotaAvailable', () => {
    it('does not throw when active bank connections are below the limit', async () => {
      const subscriptionRepo = { findActiveByOrganizationId: jest.fn().mockResolvedValue(buildSubscription({ bankConnectionLimit: 2 })), save: jest.fn() };
      const manager = buildManager(1);
      const service = new PlanLimitService(subscriptionRepo as any);

      await expect(service.assertBankConnectionQuotaAvailable('org-1', manager as any)).resolves.toBeUndefined();
      expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1, hashtext($2))', [2, 'org-1']);
      expect(subscriptionRepo.findActiveByOrganizationId).toHaveBeenCalledWith('org-1', manager);
    });

    it('throws PlanLimitExceededException when active bank connections are at the limit', async () => {
      const subscriptionRepo = { findActiveByOrganizationId: jest.fn().mockResolvedValue(buildSubscription({ bankConnectionLimit: 1 })), save: jest.fn() };
      const manager = buildManager(1);
      const service = new PlanLimitService(subscriptionRepo as any);

      await expect(service.assertBankConnectionQuotaAvailable('org-1', manager as any)).rejects.toThrow(
        PlanLimitExceededException,
      );
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test plan-limit.service.spec.ts`
Expected: FAIL — Cannot find module './plan-limit.service'

- [ ] **Step 4: Create `apps/backend/src/modules/billing/application/plan-limit.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Between, EntityManager } from 'typeorm';
import { ISubscriptionRepository, SUBSCRIPTION_REPOSITORY } from './subscription-repository.port';
import { ReceivableOrmEntity } from '../../receivables/infrastructure/receivable.orm-entity';
import { BankConnectionOrmEntity } from '../../bank-connections/infrastructure/bank-connection.orm-entity';
import { PlanLimitExceededException } from './plan-limit-exceeded.exception';

// ponytail: two constants keep the two metrics' advisory locks from colliding
// on the same (classId, objId) pair for the same organization.
const RECEIVABLE_QUOTA_LOCK_NAMESPACE = 1;
const BANK_CONNECTION_QUOTA_LOCK_NAMESPACE = 2;

@Injectable()
export class PlanLimitService {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepo: ISubscriptionRepository,
  ) {}

  async assertReceivableQuotaAvailable(organizationId: string, manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
      RECEIVABLE_QUOTA_LOCK_NAMESPACE,
      organizationId,
    ]);

    const subscription = await this.subscriptionRepo.findActiveByOrganizationId(organizationId, manager);
    if (!subscription) {
      throw new PlanLimitExceededException(
        'Không tìm thấy gói subscription đang hoạt động cho tổ chức này, vui lòng nâng cấp để tiếp tục',
      );
    }

    const count = await manager.count(ReceivableOrmEntity, {
      where: {
        organizationId,
        createdAt: Between(subscription.currentPeriodStart, subscription.currentPeriodEnd),
      },
    });

    if (count >= subscription.receivableMonthlyLimit) {
      throw new PlanLimitExceededException(
        `Đã đạt giới hạn ${subscription.receivableMonthlyLimit} receivable/tháng của gói ${subscription.planId}, nâng cấp để tiếp tục`,
      );
    }
  }

  async assertBankConnectionQuotaAvailable(organizationId: string, manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
      BANK_CONNECTION_QUOTA_LOCK_NAMESPACE,
      organizationId,
    ]);

    const subscription = await this.subscriptionRepo.findActiveByOrganizationId(organizationId, manager);
    if (!subscription) {
      throw new PlanLimitExceededException(
        'Không tìm thấy gói subscription đang hoạt động cho tổ chức này, vui lòng nâng cấp để tiếp tục',
      );
    }

    const count = await manager.count(BankConnectionOrmEntity, {
      where: { organizationId, status: 'ACTIVE' },
    });

    if (count >= subscription.bankConnectionLimit) {
      throw new PlanLimitExceededException(
        `Đã đạt giới hạn ${subscription.bankConnectionLimit} tài khoản ngân hàng của gói ${subscription.planId}, nâng cấp để tiếp tục`,
      );
    }
  }
}
```

`pg_advisory_xact_lock` auto-releases when the enclosing transaction commits or rolls back — both call sites must pass their active transaction manager, and the service has no fallback manager. This makes a quota check outside the write transaction impossible by construction.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test plan-limit.service.spec.ts`
Expected: all 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/billing/application/plan-limit-exceeded.exception.ts apps/backend/src/modules/billing/application/plan-limit.service.ts apps/backend/src/modules/billing/application/plan-limit.service.spec.ts
git commit -m "feat: add PlanLimitService with advisory-lock-guarded quota checks"
```

---

### Task 4: Wire `PlanLimitService` into `CreateReceivableUseCase`

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/create-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`

**Interfaces:**
- Consumes: `PlanLimitService` (Task 3), `IReceivableRepository.save(receivable, manager?)` (already accepts an optional `EntityManager` per `2026-08-03-multi-tenancy-rbac.md` Task 6)
- Produces: `POST /receivables` now rejects with 402 when the organization's monthly receivable quota is exhausted, consumed by Task 7's integration test

This modifies the version of `CreateReceivableUseCase` produced by `2026-08-03-multi-tenancy-rbac.md` Task 6 Step 4 (reads `organizationId` from `TenantContextService` rather than the input DTO).

- [ ] **Step 1: Update the existing unit test to cover the quota check and the transaction wrapper**

Replace `apps/backend/src/modules/receivables/application/create-receivable.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { CreateReceivableUseCase } from './create-receivable.usecase';
import { PlanLimitExceededException } from '../../billing/application/plan-limit-exceeded.exception';

describe('CreateReceivableUseCase', () => {
  function buildDeps() {
    const receivableRepo = { findById: jest.fn(), findByIdForUpdate: jest.fn(), save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const planLimitService = { assertReceivableQuotaAvailable: jest.fn(), assertBankConnectionQuotaAvailable: jest.fn() };
    const manager = {};
    const dataSource = { transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(manager)) };
    return { receivableRepo, tenantContext, planLimitService, dataSource, manager };
  }

  it('checks the receivable quota before saving, inside the same transaction', async () => {
    const { receivableRepo, tenantContext, planLimitService, dataSource, manager } = buildDeps();
    const useCase = new CreateReceivableUseCase(receivableRepo as any, tenantContext as any, planLimitService as any, dataSource as any);

    const receivable = await useCase.execute({
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 10_000_000,
      dueDate: new Date('2026-09-01'),
      salesRepresentativeId: 'user-1',
    });

    expect(planLimitService.assertReceivableQuotaAvailable).toHaveBeenCalledWith('org-1', manager);
    expect(receivableRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ReceivableStatus.OPEN }), manager);
    expect(receivable.organizationId).toBe('org-1');
  });

  it('propagates PlanLimitExceededException without saving the receivable', async () => {
    const { receivableRepo, tenantContext, planLimitService, dataSource } = buildDeps();
    planLimitService.assertReceivableQuotaAvailable.mockRejectedValue(
      new PlanLimitExceededException('Đã đạt giới hạn 1 receivable/tháng của gói FREE, nâng cấp để tiếp tục'),
    );
    const useCase = new CreateReceivableUseCase(receivableRepo as any, tenantContext as any, planLimitService as any, dataSource as any);

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        invoiceId: null,
        originalAmount: 10_000_000,
        dueDate: new Date('2026-09-01'),
        salesRepresentativeId: 'user-1',
      }),
    ).rejects.toThrow(PlanLimitExceededException);

    expect(receivableRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test create-receivable.usecase.spec.ts`
Expected: FAIL — `CreateReceivableUseCase` constructor does not yet accept `planLimitService`/`dataSource`

- [ ] **Step 3: Replace `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { PlanLimitService } from '../../billing/application/plan-limit.service';

export interface CreateReceivableInput {
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  dueDate: Date;
  salesRepresentativeId: string | null;
}

@Injectable()
export class CreateReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
    private readonly planLimitService: PlanLimitService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: CreateReceivableInput, manager?: EntityManager): Promise<Receivable> {
    const organizationId = this.tenantContext.getOrganizationId();

    const persist = async (manager: EntityManager): Promise<Receivable> => {
      await this.planLimitService.assertReceivableQuotaAvailable(organizationId, manager);

      const receivable = new Receivable({
        id: randomUUID(),
        organizationId,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        originalAmount: input.originalAmount,
        paidAmount: 0,
        dueDate: input.dueDate,
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: input.salesRepresentativeId,
        createdAt: new Date(),
        closedAt: null,
      });
      await this.receivableRepo.save(receivable, manager);
      return receivable;
    };

    return manager ? persist(manager) : this.dataSource.transaction(persist);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test create-receivable.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Import `BillingModule` in `apps/backend/src/modules/receivables/receivables.module.ts`**

Add `BillingModule` to `imports`:

```typescript
import { BillingModule } from '../billing/billing.module';
// ...
@Module({
  imports: [TypeOrmModule.forFeature([ReceivableOrmEntity]), BillingModule],
  // ...
})
export class ReceivablesModule {}
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/receivables/application/create-receivable.usecase.ts apps/backend/src/modules/receivables/application/create-receivable.usecase.spec.ts apps/backend/src/modules/receivables/receivables.module.ts
git commit -m "feat: enforce receivable monthly quota in CreateReceivableUseCase"
```

---

### Task 5: Wire `PlanLimitService` into `ExchangeTokenUseCase`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

**Interfaces:**
- Consumes: `PlanLimitService` (Task 3)
- Produces: `POST /bank-connections/cas-id/sessions/:id/exchange` now rejects with 402 before flipping a connection to `ACTIVE` when the organization's active-bank-connection quota is exhausted

- [ ] **Step 1: Add an optional `EntityManager` parameter to `IBankConnectionRepository.save`**

Modify `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { BankConnection } from '../domain/bank-connection';

export interface IBankConnectionRepository {
  findById(id: string): Promise<BankConnection | null>;
  findByIdUnscoped(id: string): Promise<BankConnection | null>;
  save(connection: BankConnection, manager?: EntityManager): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
```

- [ ] **Step 2: Update `TypeOrmBankConnectionRepository.save` to use the manager when provided**

Modify `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts` — replace the `save` method:

```typescript
  async save(connection: BankConnection, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager ? manager.getRepository(BankConnectionOrmEntity) : this.rawRepo;
    await repo.save({ ...connection, organizationId } as BankConnectionOrmEntity);
  }
```

Add `EntityManager` to the `typeorm` import at the top of the file.

`this.tenantContext.getOrganizationId()` overrides any `organizationId` the caller set, matching `BaseRepository.scopedSave`'s contract — safe here because `ExchangeTokenUseCase` runs inside an authenticated request where `TenantContextService` is populated.

- [ ] **Step 3: Update the existing unit test to cover the quota check and the transaction wrapper**

Replace `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.spec.ts`:

```typescript
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { ExchangeTokenUseCase } from './exchange-token.usecase';
import { PlanLimitExceededException } from '../../billing/application/plan-limit-exceeded.exception';

function buildSession(overrides: Partial<ConstructorParameters<typeof CasIdConnectionSession>[0]> = {}) {
  return new CasIdConnectionSession({
    id: 'sess-1',
    organizationId: 'org-1',
    initiatedByUserId: 'user-1',
    grantToken: 'mock-grant-token-1',
    scopes: ['identity', 'transaction'],
    redirectUri: 'http://localhost/callback',
    status: 'PENDING_AUTHORIZATION',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('ExchangeTokenUseCase', () => {
  function buildDeps() {
    const session = buildSession();
    const sessionRepo = { findById: jest.fn().mockResolvedValue(session), save: jest.fn() };
    const adapter = {
      createGrantToken: jest.fn(),
      exchangeToken: jest.fn().mockResolvedValue({ accessToken: 'real-access-token' }),
      invalidateToken: jest.fn(),
      getAccountIdentity: jest.fn().mockResolvedValue({ accountNumber: '0011002233', bankName: 'ABC Bank' }),
      getTransactions: jest.fn(),
    };
    const bankConnectionRepo = { save: jest.fn(), findById: jest.fn(), findByIdUnscoped: jest.fn() };
    const auditEventRepo = { save: jest.fn() };
    const planLimitService = { assertReceivableQuotaAvailable: jest.fn(), assertBankConnectionQuotaAvailable: jest.fn() };
    const manager = {};
    const dataSource = { transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(manager)) };
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    return { session, sessionRepo, adapter, bankConnectionRepo, auditEventRepo, planLimitService, dataSource, manager };
  }

  it('checks the bank connection quota before saving the ACTIVE connection, inside the same transaction', async () => {
    const { sessionRepo, adapter, bankConnectionRepo, auditEventRepo, planLimitService, dataSource, manager } = buildDeps();
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as any,
      adapter as any,
      bankConnectionRepo as any,
      auditEventRepo as any,
      planLimitService as any,
      dataSource as any,
    );

    await useCase.execute({ sessionId: 'sess-1', publicToken: 'public-token-xyz' });

    expect(planLimitService.assertBankConnectionQuotaAvailable).toHaveBeenCalledWith('org-1', manager);
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', organizationId: 'org-1' }),
      manager,
    );
    expect(sessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
    expect(auditEventRepo.save).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TOKEN_EXCHANGED' }));
  });

  it('propagates PlanLimitExceededException without saving the connection or completing the session', async () => {
    const { sessionRepo, adapter, bankConnectionRepo, auditEventRepo, planLimitService, dataSource } = buildDeps();
    planLimitService.assertBankConnectionQuotaAvailable.mockRejectedValue(
      new PlanLimitExceededException('Đã đạt giới hạn 1 tài khoản ngân hàng của gói FREE, nâng cấp để tiếp tục'),
    );
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as any,
      adapter as any,
      bankConnectionRepo as any,
      auditEventRepo as any,
      planLimitService as any,
      dataSource as any,
    );

    await expect(useCase.execute({ sessionId: 'sess-1', publicToken: 'public-token-xyz' })).rejects.toThrow(
      PlanLimitExceededException,
    );

    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(sessionRepo.save).not.toHaveBeenCalled();
    expect(auditEventRepo.save).not.toHaveBeenCalled();
  });

  it('throws when the session is expired', async () => {
    const expiredSession = buildSession({ id: 'sess-2', expiresAt: new Date(Date.now() - 60_000) });
    const sessionRepo = { findById: jest.fn().mockResolvedValue(expiredSession), save: jest.fn() };

    const useCase = new ExchangeTokenUseCase(sessionRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect(useCase.execute({ sessionId: 'sess-2', publicToken: 'x' })).rejects.toThrow(
      'Connection session expired',
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test exchange-token.usecase.spec.ts`
Expected: FAIL — `ExchangeTokenUseCase` constructor does not yet accept `planLimitService`/`dataSource`

- [ ] **Step 5: Replace `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  ICasIdConnectionSessionRepository,
  CAS_ID_CONNECTION_SESSION_REPOSITORY,
} from './cas-id-connection-session-repository.port';
import {
  ICasIdIntegrationAdapter,
  CAS_ID_INTEGRATION_ADAPTER,
} from './cas-id-integration-adapter.port';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from './bank-connection-repository.port';
import {
  IConnectionAuditEventRepository,
  CONNECTION_AUDIT_EVENT_REPOSITORY,
} from './connection-audit-event-repository.port';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { encryptToken } from './token-encryption';
import { PlanLimitService } from '../../billing/application/plan-limit.service';

export interface ExchangeTokenInput {
  sessionId: string;
  publicToken: string;
}

@Injectable()
export class ExchangeTokenUseCase {
  constructor(
    @Inject(CAS_ID_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepo: ICasIdConnectionSessionRepository,
    @Inject(CAS_ID_INTEGRATION_ADAPTER) private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly planLimitService: PlanLimitService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ExchangeTokenInput): Promise<BankConnection> {
    const session = await this.sessionRepo.findById(input.sessionId);
    if (!session) {
      throw new Error('Connection session not found');
    }
    if (session.isExpired(new Date())) {
      throw new Error('Connection session expired');
    }

    const { accessToken } = await this.adapter.exchangeToken(input.publicToken);
    const accountIdentity = await this.adapter.getAccountIdentity(accessToken);

    const connection = new BankConnection({
      id: randomUUID(),
      organizationId: session.organizationId,
      casIdConnectionSessionId: session.id,
      encryptedAccessToken: encryptToken(accessToken),
      accountIdentity,
      status: 'ACTIVE',
      scopes: session.scopes,
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });

    await this.dataSource.transaction(async (manager) => {
      await this.planLimitService.assertBankConnectionQuotaAvailable(session.organizationId, manager);
      await this.bankConnectionRepo.save(connection, manager);
    });

    await this.sessionRepo.save(session.markCompleted());
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connection.id,
        eventType: 'TOKEN_EXCHANGED',
        metadata: { accountNumber: accountIdentity.accountNumber },
        createdAt: new Date(),
      }),
    );

    return connection;
  }
}
```

The quota check and the `ACTIVE` connection insert happen inside the same `dataSource.transaction(...)`, serialized by `pg_advisory_xact_lock` inside `PlanLimitService` — two concurrent exchange calls for the same organization cannot both slip past `bankConnectionLimit`. Marking the session `COMPLETED` and writing the audit event happen afterward since neither affects the quota race.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test exchange-token.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 7: Import `BillingModule` in `apps/backend/src/modules/bank-connections/bank-connections.module.ts`**

Add `BillingModule` to `imports`:

```typescript
import { BillingModule } from '../billing/billing.module';
// ...
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CasIdConnectionSessionOrmEntity,
      BankConnectionOrmEntity,
      ConnectionAuditEventOrmEntity,
    ]),
    BillingModule,
  ],
  // ...
})
export class BankConnectionsModule {}
```

- [ ] **Step 8: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/bank-connections
git commit -m "feat: enforce active bank connection quota in ExchangeTokenUseCase"
```

---

### Task 6: Register `BillingModule` in `AppModule`

**Files:**
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `BillingModule` (Task 2)
- Produces: `SUBSCRIPTION_REPOSITORY`/`PlanLimitService` resolvable app-wide, consumed by Task 7's integration test (which seeds a `Subscription` via `SUBSCRIPTION_REPOSITORY`)

- [ ] **Step 1: Add `BillingModule` to `apps/backend/src/app.module.ts`**

```typescript
import { BillingModule } from './modules/billing/billing.module';
// ...
@Module({
  imports: [
    // ...existing imports (OrganizationsModule, CustomersModule, InvoicesModule, ReceivablesModule, PaymentsModule, BankConnectionsModule)...
    BillingModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 2: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/app.module.ts
git commit -m "feat: register BillingModule in AppModule"
```

---

### Task 7: Integration test — receivable monthly quota enforcement (testcontainers + supertest)

**Files:**
- Create: `apps/backend/test/billing/receivable-quota.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-6), real Postgres via testcontainers
- Produces: verified end-to-end proof that a `Subscription` with `receivableMonthlyLimit = 1` allows exactly 1 `POST /receivables` in the current month and rejects the 2nd with a clear 402 error

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/billing/receivable-quota.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CustomerOrmEntity } from '../../src/modules/customers/infrastructure/customer.orm-entity';
import { SubscriptionOrmEntity } from '../../src/modules/billing/infrastructure/subscription.orm-entity';
import { UserOrmEntity } from '../../src/modules/users/infrastructure/user.orm-entity';
import { MembershipOrmEntity } from '../../src/modules/organizations/infrastructure/membership.orm-entity';

describe('Receivable monthly quota enforcement (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000030';
  const customerId = '00000000-0000-0000-0000-000000000031';
  const userId = '00000000-0000-0000-0000-000000000032';

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
      name: 'Quota Test Customer',
      taxCode: '222',
      email: 'quota@test.vn',
      phone: '0900000002',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Quota Owner',
      email: 'quota-owner@test.vn',
      passwordHash: 'fixture-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: '00000000-0000-0000-0000-000000000034',
      organizationId,
      userId,
      role: 'OWNER',
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    const now = new Date('2026-08-03T00:00:00.000Z');
    const currentPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const currentPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-0000-0000-000000000033',
      organizationId,
      planId: 'FREE',
      receivableMonthlyLimit: 1,
      bankConnectionLimit: 1,
      status: 'ACTIVE',
      currentPeriodStart,
      currentPeriodEnd,
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function token(): string {
    return jwtService.sign({ userId, organizationId, role: 'OWNER' });
  }

  it('allows the 1st receivable of the month', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        customerId,
        originalAmount: 5_000_000,
        dueDate: '2026-09-01',
        salesRepresentativeId: userId,
      })
      .expect(201);
  });

  it('rejects the 2nd receivable of the same month with a clear 402 upgrade error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        customerId,
        originalAmount: 5_000_000,
        dueDate: '2026-09-05',
        salesRepresentativeId: userId,
      })
      .expect(402);

    expect(response.body.message).toContain('giới hạn');
    expect(response.body.message).toContain('FREE');

    const rows = await dataSource.query('SELECT COUNT(*)::int AS count FROM receivables WHERE "organizationId" = $1', [
      organizationId,
    ]);
    expect(rows[0].count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- billing/receivable-quota.integration.spec.ts`
Expected: both tests PASS (run in order: 1st receivable succeeds, 2nd is blocked and the DB still shows exactly 1 row)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/billing/receivable-quota.integration.spec.ts
git commit -m "test: add integration test for receivable monthly quota enforcement"
```

---

## Self-Review Notes

- **Spec coverage:** No `UsageRecord`/`UsageAggregate` table (spec mục 2) → Task 3's `PlanLimitService` counts directly from `ReceivableOrmEntity`/`BankConnectionOrmEntity`. Transactional hard block avoiding race conditions (spec mục 3) → Task 4 (`CreateReceivableUseCase` wraps quota-check + insert in `dataSource.transaction` guarded by `pg_advisory_xact_lock`) and Task 5 (same pattern for `ExchangeTokenUseCase`'s `ACTIVE` `BankConnection` insert). 402 error prompting upgrade (spec mục 3) → `PlanLimitExceededException` (Task 3). Overage billing, usage event log for email/AI/user-seat, subscription payment via CASSO (spec mục 4) — explicitly out of scope, not implemented.
- **Not covered in this plan (by design):** upgrade/downgrade endpoints and billing checkout. Signup provisioning is implemented by the Authentication & Onboarding plan, which creates the `ACTIVE/FREE` row required by this plan. No `Plan` catalog table — `planId`/limits are intentionally denormalized directly onto `Subscription` for MVP, matching the revised billing spec.
- **Type consistency checked:** `ISubscriptionRepository.findActiveByOrganizationId(organizationId, manager)` and both quota methods require the active transaction manager; `CreateReceivableUseCase` and `ExchangeTokenUseCase` pass that same manager through quota read, count, and write. `CreateReceivableInput` uses `salesRepresentativeId`, not the retired `ownerUserId`. `Permission.SUBSCRIPTION_MANAGE` from `2026-08-03-multi-tenancy-rbac.md` Task 8 is reused as-is — no new Permission enum values added since this plan introduces no new write endpoint.


