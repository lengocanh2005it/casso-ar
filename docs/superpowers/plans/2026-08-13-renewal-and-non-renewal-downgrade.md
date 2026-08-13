# Renewal & Non-Renewal Downgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid-tier `Subscription` must pay a recurring `PeriodCharge` (a PayOS payment) to keep its tier each billing period; if unpaid 3 days past period end, it automatically reverts to FREE. A daily reminder cron proactively creates the next `PeriodCharge` and emails a checkout link before the period ends.

**Architecture:** New `PeriodCharge` domain entity in the existing `payos/` module (Clean Architecture, mirrors the shipped `PlanUpgradeOrder` from issue #152/PR #156: domain entity → port → TypeORM repository → use cases → controller). Two new `@Cron` scanners (also in `payos/`) drive the reminder and the downgrade. `PeriodCharge` and `PlanUpgradeOrder` share the PayOS payment-link adapter and webhook-auth guard but are kept as two distinct entities/use cases per ADR-0012 — not collapsed into one.

**Tech Stack:** NestJS 11, TypeORM 1.1, `@nestjs/schedule` (`@Cron`), `@payos/node`, BullMQ (existing `notifications` email queue), Jest 30 + testcontainers.

## Global Constraints

- Money: integers in VND units, never float/decimal (AGENTS.md).
- Every write that changes an amount/status runs inside one DB transaction (AGENTS.md).
- `domain/` never imports NestJS/TypeORM; `application/` never imports `@payos/node` directly or throws `HttpException` — only `AppError` (AGENTS.md, `.claude/rules/application.md`).
- Every tenant-scoped write is scoped by `organizationId`; CRUD repositories extend `BaseRepository` (`.claude/rules/infrastructure.md`) — except the two new cross-tenant cron-read methods, which are system-wide by design (mirrors `IOrganizationRepository.findAllIds()`).
- Domain ↔ ORM translation is an explicit `toOrm()`/`toDomain()` mapper, never a cast (AGENTS.md).
- Webhook auth: constant-time comparison — reused as-is from `PayosWebhookAuthGuard`, not re-implemented (AGENTS.md).
- TDD RED → GREEN → REFACTOR for every task except the migration and `app.module.ts`/`payos.module.ts` wiring steps (config-only, per AGENTS.md's stated TDD exception).
- Error shape: `{ statusCode, errorCode, message, details? }` via `AppError` + `HttpExceptionFilter`.
- Timezone: `Asia/Ho_Chi_Minh` for the two new crons (matches the existing reminder cron's convention).

## Design Decisions Carried From Domain-Modeling (`CONTEXT.md`, ADR-0012)

1. **`PeriodCharge` is a distinct entity from `PlanUpgradeOrder`** — same tier as the subscription's current plan (not strictly higher), one PAID charge required per billing period.
2. **The `PlanUpgradeOrder` that moved a `Subscription` onto a tier counts as that tier's first period paid** — checked by looking for a PAID `PlanUpgradeOrder` whose `updatedAt` falls inside the current period, so no separate `PeriodCharge` is needed for the period an upgrade lands in.
3. **3-day grace window, `Subscription.status` stays `ACTIVE`** — deliberately not `PAST_DUE` (`plan-limit.service.ts:135` already hard-blocks every non-`ACTIVE` status). Grace is purely "does a PAID `PeriodCharge`/qualifying `PlanUpgradeOrder` exist for the current period," never a status flag.
4. **A reminder cron** creates the next `PeriodCharge` + emails a checkout link once, on the exact day `RENEWAL_REMINDER_LEAD_DAYS` (3) before period end — a single trigger point, not a range, so it never creates duplicate `PeriodCharge` rows for the same period.
5. **`Subscription.revertToFreeForNonRenewal()`** is a new, distinctly-named domain method — the *only* code path that can move a `Subscription` to a lower tier, preserving ADR-0011's invariant that `changeToPlan()` (upgrade-only) can never downgrade.

## New Technical Finding (surfaced while writing this plan)

**`@nestjs/schedule`'s `ScheduleModule.forRoot()` is never registered anywhere in this app** — grep confirms only `reminder-scheduler.service.ts` imports `@Cron`, and no file imports `ScheduleModule`. Without `ScheduleModule.forRoot()`, `@Cron`-decorated methods are never actually scheduled by Nest — meaning the existing daily reminder scan has **not been running** in any environment that boots this app normally. Task 15 adds `ScheduleModule.forRoot()` to `app.module.ts`, which is required for this plan's two new crons to run at all, and as a side effect finally activates the pre-existing reminder cron too. This is called out explicitly in the PR description — it is a real fix, not scope creep, but the implementer should mention it prominently since it changes production behavior of already-shipped code.

## The `orderCode` Collision Problem (and its fix)

`PlanUpgradeOrder.orderCode` and the new `PeriodCharge.orderCode` are both Postgres `bigserial` columns, each starting its own private sequence at 1. If left as-is, both tables would independently produce `orderCode = 1, 2, 3, ...` — a real collision: a PayOS webhook carries only a bare `orderCode` number with no table/type discriminator, so `orderCode = 1` would be ambiguous between a `PlanUpgradeOrder` and a `PeriodCharge`, and (per this plan's webhook-dispatch design in Task 10) could confirm the wrong entity for the wrong organization.

**Fix:** `PeriodCharge`'s *domain-level* `orderCode` is always `rawOrmValue + 100_000_000` (`PERIOD_CHARGE_ORDER_CODE_OFFSET`), computed entirely in the repository's `toDomain`/`toRawOrderCode` mapper — no schema change, no shared Postgres sequence, no dev/prod divergence. `PlanUpgradeOrder`'s orderCode space (small numbers, unchanged) and `PeriodCharge`'s (always > 100,000,000) can never overlap. `100_000_000` gives comfortable headroom for this product's realistic order volume; if that ever becomes a real concern, revisit then.

---

### Task 1: `PeriodChargeStatus` enum

**Files:**
- Create: `packages/shared-types/src/period-charge-status.ts`
- Modify: `packages/shared-types/src/index.ts`

**Interfaces:**
- Produces: `PeriodChargeStatus` enum (`PENDING | PAID | FAILED`), exported from `@casso-ledger/shared-types`.

This is a plain type addition (no behavior), so RED/GREEN doesn't apply in the usual sense — the "test" is Task 2's domain spec importing and using it. Still commit it as its own step per AGENTS.md's file/naming conventions.

- [ ] **Step 1: Create the enum**

```typescript
// packages/shared-types/src/period-charge-status.ts
export enum PeriodChargeStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}
```

- [ ] **Step 2: Export it**

```typescript
// packages/shared-types/src/index.ts — add this line alongside the existing PlanUpgradeOrderStatus export
export { PeriodChargeStatus } from './period-charge-status';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS (nothing references it yet, but the package must compile)

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/period-charge-status.ts packages/shared-types/src/index.ts
git commit -m "feat: add PeriodChargeStatus enum"
```

---

### Task 2: `PeriodCharge` domain entity

**Files:**
- Create: `apps/backend/src/modules/payos/domain/period-charge.ts`
- Test: `apps/backend/src/modules/payos/domain/period-charge.spec.ts`

**Interfaces:**
- Consumes: `PeriodChargeStatus`, `PlanId` from `@casso-ledger/shared-types`.
- Produces: `PeriodCharge` class with `id: string`, `orderCode: number`, `organizationId: string`, `planId: PlanId`, `periodStart: Date`, `periodEnd: Date`, `status: PeriodChargeStatus`, `createdAt: Date`, `updatedAt: Date` (all readonly); methods `markPaid(): PeriodCharge`, `markFailed(): PeriodCharge`, `isTerminal(): boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/domain/period-charge.spec.ts
import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';
import { PeriodCharge } from './period-charge';

function buildCharge(status = PeriodChargeStatus.PENDING): PeriodCharge {
  return new PeriodCharge({
    id: 'charge-1',
    orderCode: 100_000_001,
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    status,
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  });
}

describe('PeriodCharge', () => {
  it('markPaid() transitions PENDING to PAID', () => {
    const charge = buildCharge();
    const paid = charge.markPaid();
    expect(paid.status).toBe(PeriodChargeStatus.PAID);
    expect(paid.orderCode).toBe(charge.orderCode);
  });

  it('markFailed() transitions PENDING to FAILED', () => {
    const charge = buildCharge();
    const failed = charge.markFailed();
    expect(failed.status).toBe(PeriodChargeStatus.FAILED);
  });

  it('isTerminal() is false for PENDING, true for PAID/FAILED', () => {
    expect(buildCharge(PeriodChargeStatus.PENDING).isTerminal()).toBe(false);
    expect(buildCharge(PeriodChargeStatus.PAID).isTerminal()).toBe(true);
    expect(buildCharge(PeriodChargeStatus.FAILED).isTerminal()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "payos/domain/period-charge.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './period-charge'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/domain/period-charge.ts
import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';

export interface PeriodChargeProps {
  id: string;
  orderCode: number;
  organizationId: string;
  planId: PlanId;
  periodStart: Date;
  periodEnd: Date;
  status: PeriodChargeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PeriodCharge {
  readonly id: string;
  readonly orderCode: number;
  readonly organizationId: string;
  readonly planId: PlanId;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly status: PeriodChargeStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PeriodChargeProps) {
    this.id = props.id;
    this.orderCode = props.orderCode;
    this.organizationId = props.organizationId;
    this.planId = props.planId;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  markPaid(): PeriodCharge {
    return new PeriodCharge({
      ...this,
      status: PeriodChargeStatus.PAID,
      updatedAt: new Date(),
    });
  }

  markFailed(): PeriodCharge {
    return new PeriodCharge({
      ...this,
      status: PeriodChargeStatus.FAILED,
      updatedAt: new Date(),
    });
  }

  isTerminal(): boolean {
    return this.status !== PeriodChargeStatus.PENDING;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns "payos/domain/period-charge.spec"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/domain/period-charge.ts apps/backend/src/modules/payos/domain/period-charge.spec.ts
git commit -m "feat: PeriodCharge domain entity"
```

---

### Task 3: `Subscription.revertToFreeForNonRenewal()`

**Files:**
- Modify: `apps/backend/src/modules/billing/domain/subscription.ts`
- Test: `apps/backend/src/modules/billing/domain/subscription.spec.ts`

**Interfaces:**
- Produces: `Subscription.revertToFreeForNonRenewal(now: Date): Subscription` — unconditionally transitions to `PlanId.FREE` with FREE's limits, bypassing the `isUpgradeTo`/tier-strictly-higher guard in `changeToPlan()`. This is the *only* method allowed to move a `Subscription` to a lower tier (ADR-0011).

- [ ] **Step 1: Write the failing test**

Add to the existing `apps/backend/src/modules/billing/domain/subscription.spec.ts` (open the file, find the `describe('Subscription', ...)` block, add this `describe` alongside the existing `changeToPlan` tests):

```typescript
describe('revertToFreeForNonRenewal', () => {
  it('moves a paid-tier subscription to FREE regardless of tier direction', () => {
    const subscription = Subscription.createBusiness(
      'sub-1',
      'org-1',
      new Date('2026-08-01T00:00:00Z'),
    );
    const reverted = subscription.revertToFreeForNonRenewal(
      new Date('2026-09-04T00:00:00Z'),
    );
    expect(reverted.planId).toBe(PlanId.FREE);
    expect(reverted.receivableMonthlyLimit).toBe(50);
    expect(reverted.bankConnectionLimit).toBe(1);
    expect(reverted.copilotChatMonthlyLimit).toBe(50);
    expect(reverted.canUseCustomSmtp).toBe(false);
  });

  it('is a no-op tier check bypass — does not throw even though FREE is a lower tier', () => {
    const subscription = Subscription.createStarter(
      'sub-1',
      'org-1',
      new Date('2026-08-01T00:00:00Z'),
    );
    expect(() =>
      subscription.revertToFreeForNonRenewal(new Date('2026-09-04T00:00:00Z')),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "billing/domain/subscription.spec"` (from `apps/backend`)
Expected: FAIL — `subscription.revertToFreeForNonRenewal is not a function`

- [ ] **Step 3: Write minimal implementation**

Add this method to the `Subscription` class in `apps/backend/src/modules/billing/domain/subscription.ts`, right after `changeToPlan`:

```typescript
  // The only method allowed to move a Subscription to a LOWER tier — used
  // exclusively by the non-renewal downgrade path (#153, ADR-0012).
  // changeToPlan() enforces upgrade-only (ADR-0011); this deliberately
  // bypasses that check because FREE is always the target, never a
  // user-triggered downgrade.
  revertToFreeForNonRenewal(_now: Date): Subscription {
    const plan = PLAN_CATALOG[PlanId.FREE];
    return new Subscription({
      ...this,
      planId: PlanId.FREE,
      receivableMonthlyLimit: plan.receivableMonthlyLimit,
      bankConnectionLimit: plan.bankConnectionLimit,
      copilotChatMonthlyLimit: plan.copilotChatMonthlyLimit,
      canUseCustomSmtp: plan.canUseCustomSmtp,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns "billing/domain/subscription.spec"`
Expected: PASS (all existing + 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/domain/subscription.ts apps/backend/src/modules/billing/domain/subscription.spec.ts
git commit -m "feat: Subscription.revertToFreeForNonRenewal for issue #153"
```

---

### Task 4: `IPeriodChargeRepository` port

**Files:**
- Create: `apps/backend/src/modules/payos/application/period-charge-repository.port.ts`

**Interfaces:**
- Consumes: `PeriodCharge` (Task 2), `PlanId` from `@casso-ledger/shared-types`, `EntityManager` from `typeorm`.
- Produces:
  ```typescript
  export interface CreatePeriodChargeInput {
    organizationId: string;
    planId: PlanId;
    periodStart: Date;
    periodEnd: Date;
  }
  export interface IPeriodChargeRepository {
    create(input: CreatePeriodChargeInput): Promise<PeriodCharge>;
    lockAndFindByOrderCode(orderCode: number, manager: EntityManager): Promise<PeriodCharge | null>;
    save(charge: PeriodCharge, manager?: EntityManager, organizationId?: string): Promise<void>;
    findLatestByOrganizationAndPeriodStart(organizationId: string, periodStart: Date): Promise<PeriodCharge | null>;
  }
  export const PERIOD_CHARGE_REPOSITORY: symbol;
  ```

This is a pure interface (no runtime behavior) — mirrors `plan-upgrade-order-repository.port.ts` exactly. No test; verified by Task 6's repository implementing it and Task 8/9's use cases compiling against it.

- [ ] **Step 1: Write the port**

```typescript
// apps/backend/src/modules/payos/application/period-charge-repository.port.ts
import type { PlanId } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import type { PeriodCharge } from '../domain/period-charge';

export interface CreatePeriodChargeInput {
  organizationId: string;
  planId: PlanId;
  periodStart: Date;
  periodEnd: Date;
}

export interface IPeriodChargeRepository {
  create(input: CreatePeriodChargeInput): Promise<PeriodCharge>;
  lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PeriodCharge | null>;
  save(
    charge: PeriodCharge,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void>;
  // Used by PeriodPaymentStatusService (Task 12) to check "has this org paid
  // for its current period yet" — returns the most recent attempt (PENDING,
  // FAILED, or PAID) regardless of outcome; the caller checks .status.
  findLatestByOrganizationAndPeriodStart(
    organizationId: string,
    periodStart: Date,
  ): Promise<PeriodCharge | null>;
}

export const PERIOD_CHARGE_REPOSITORY = Symbol('PERIOD_CHARGE_REPOSITORY');
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/payos/application/period-charge-repository.port.ts
git commit -m "feat: IPeriodChargeRepository port"
```

---

### Task 5: `PeriodChargeOrmEntity` + migration

**Files:**
- Create: `apps/backend/src/modules/payos/infrastructure/period-charge.orm-entity.ts`
- Create: `apps/backend/src/database/migrations/20260814000000-add-period-charges-table.ts`

**Interfaces:**
- Produces: `PeriodChargeOrmEntity` class (TypeORM entity for table `period_charges`) with columns `id` (uuid pk), `orderCode` (bigserial, private per-table sequence — see the collision-fix note above; this raw value gets the `+100_000_000` offset applied in Task 6's repository, not here), `organizationId`, `planId` (enum), `periodStart`/`periodEnd` (timestamptz), `status` (enum), `createdAt`/`updatedAt` (timestamptz).

Migrations are a stated TDD exception (AGENTS.md) — no RED/GREEN cycle, verified instead by running it against a real Postgres container in Task 6's repository test.

- [ ] **Step 1: Write the ORM entity**

```typescript
// apps/backend/src/modules/payos/infrastructure/period-charge.orm-entity.ts
import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';
import {
  Column,
  Entity,
  Generated,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'period_charges' })
@Index(['orderCode'], { unique: true })
export class PeriodChargeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('bigint')
  @Generated('increment')
  orderCode: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: PlanId })
  planId: PlanId;

  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  @Column({ type: 'enum', enum: PeriodChargeStatus })
  status: PeriodChargeStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Write the migration**

```typescript
// apps/backend/src/database/migrations/20260814000000-add-period-charges-table.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPeriodChargesTable20260814000000
  implements MigrationInterface
{
  name = 'AddPeriodChargesTable20260814000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "period_charges_planId_enum" AS ENUM ('FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "period_charges_status_enum" AS ENUM ('PENDING', 'PAID', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "period_charges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderCode" bigserial NOT NULL,
        "organizationId" character varying NOT NULL,
        "planId" "period_charges_planId_enum" NOT NULL,
        "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL,
        "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "period_charges_status_enum" NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_period_charges" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_period_charges_order_code" ON "period_charges" ("orderCode")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_period_charges_organization_period_start" ON "period_charges" ("organizationId", "periodStart")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_period_charges_organization_period_start"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_period_charges_order_code"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "period_charges"');
    await queryRunner.query('DROP TYPE IF EXISTS "period_charges_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "period_charges_planId_enum"');
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 4: Verify the migration against a real Postgres** (same technique used for the `plan_upgrade_orders` migration in PR #156 — write a throwaway `test/scratch-verify-period-charges-migration.e2e-spec.ts` that spins up a `PostgreSqlContainer`, runs `up()`, inserts a row, runs `up()` again to confirm idempotency, runs `down()`, asserts the table is gone — then delete the scratch file once green)

Run: `npx jest --config ./test/jest-e2e.json --testPathPatterns "scratch-verify-period-charges-migration"` (from `apps/backend`)
Expected: PASS, then delete the scratch file

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/infrastructure/period-charge.orm-entity.ts apps/backend/src/database/migrations/20260814000000-add-period-charges-table.ts
git commit -m "feat: PeriodCharge ORM entity and migration"
```

---

### Task 6: `TypeOrmPeriodChargeRepository`

**Files:**
- Create: `apps/backend/src/modules/payos/infrastructure/typeorm-period-charge.repository.ts`
- Test: `apps/backend/src/modules/payos/infrastructure/typeorm-period-charge.repository.spec.ts`

**Interfaces:**
- Consumes: `IPeriodChargeRepository` (Task 4), `PeriodChargeOrmEntity` (Task 5), `BaseRepository`/`TenantContextService` (`common/tenancy/`).
- Produces: `TypeOrmPeriodChargeRepository implements IPeriodChargeRepository`, plus the exported constant `PERIOD_CHARGE_ORDER_CODE_OFFSET = 100_000_000` (used nowhere else, but documents the collision fix at its source).

This repository talks to a real Postgres in its test (matches `typeorm-plan-upgrade-order.repository.ts`'s sibling test style, which itself has no dedicated spec — checked: `plan-upgrade-order` repository is only exercised via the e2e test. Follow that same precedent: this repository is verified by Task 16's e2e test, not a dedicated unit spec, since every method needs a real Postgres connection (advisory-free but does exercise `pessimistic_write` locking and the ORM mapping) and the existing codebase's pattern for this exact repository shape is e2e-only coverage.

- [ ] **Step 1: Write the implementation**

```typescript
// apps/backend/src/modules/payos/infrastructure/typeorm-period-charge.repository.ts
import { PeriodChargeStatus } from '@casso-ledger/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CreatePeriodChargeInput,
  IPeriodChargeRepository,
} from '../application/period-charge-repository.port';
import { PeriodCharge } from '../domain/period-charge';
import { PeriodChargeOrmEntity } from './period-charge.orm-entity';

// PlanUpgradeOrder and PeriodCharge each auto-increment their own orderCode
// from 1 in their own table — left alone, both would produce orderCode=1,2,3…
// independently, and a PayOS webhook (a bare orderCode number, no table
// discriminator) would be ambiguous between the two. Offsetting PeriodCharge's
// DOMAIN-level orderCode by a large constant makes the two spaces disjoint
// without touching the schema or needing a shared Postgres sequence — see
// docs/superpowers/plans/2026-08-13-renewal-and-non-renewal-downgrade.md.
export const PERIOD_CHARGE_ORDER_CODE_OFFSET = 100_000_000;

function toDomainOrderCode(rawOrderCode: string): number {
  return Number(rawOrderCode) + PERIOD_CHARGE_ORDER_CODE_OFFSET;
}

function toRawOrderCode(domainOrderCode: number): number {
  return domainOrderCode - PERIOD_CHARGE_ORDER_CODE_OFFSET;
}

function toDomain(row: PeriodChargeOrmEntity): PeriodCharge {
  return new PeriodCharge({
    id: row.id,
    orderCode: toDomainOrderCode(row.orderCode),
    organizationId: row.organizationId,
    planId: row.planId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toOrm(charge: PeriodCharge): PeriodChargeOrmEntity {
  return {
    id: charge.id,
    orderCode: String(toRawOrderCode(charge.orderCode)),
    organizationId: charge.organizationId,
    planId: charge.planId,
    periodStart: charge.periodStart,
    periodEnd: charge.periodEnd,
    status: charge.status,
    createdAt: charge.createdAt,
    updatedAt: charge.updatedAt,
  };
}

@Injectable()
export class TypeOrmPeriodChargeRepository
  extends BaseRepository<PeriodChargeOrmEntity>
  implements IPeriodChargeRepository
{
  constructor(
    @InjectRepository(PeriodChargeOrmEntity)
    repo: Repository<PeriodChargeOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(input: CreatePeriodChargeInput): Promise<PeriodCharge> {
    const now = new Date();
    const saved = await this.ormRepo.save({
      organizationId: input.organizationId,
      planId: input.planId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: PeriodChargeStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
    return toDomain(saved);
  }

  async lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PeriodCharge | null> {
    const raw = toRawOrderCode(orderCode);
    if (raw <= 0) return null; // belongs to a different orderCode space (e.g. PlanUpgradeOrder)
    const row = await manager
      .getRepository(PeriodChargeOrmEntity)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.orderCode = :orderCode', { orderCode: String(raw) })
      .getOne();
    return row ? toDomain(row) : null;
  }

  async save(
    charge: PeriodCharge,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void> {
    await this.scopedSaveWithManager(toOrm(charge), manager, organizationId);
  }

  async findLatestByOrganizationAndPeriodStart(
    organizationId: string,
    periodStart: Date,
  ): Promise<PeriodCharge | null> {
    const row = await this.ormRepo.findOne({
      where: { organizationId, periodStart },
      order: { createdAt: 'DESC' },
    });
    return row ? toDomain(row) : null;
  }
}
```

- [ ] **Step 2: Write a focused unit test for the orderCode offset** (the one piece of logic here that isn't a straight DB passthrough)

```typescript
// apps/backend/src/modules/payos/infrastructure/typeorm-period-charge.repository.spec.ts
import { PERIOD_CHARGE_ORDER_CODE_OFFSET } from './typeorm-period-charge.repository';

describe('PERIOD_CHARGE_ORDER_CODE_OFFSET', () => {
  it('is large enough that PlanUpgradeOrder and PeriodCharge orderCode spaces cannot overlap for realistic order volume', () => {
    expect(PERIOD_CHARGE_ORDER_CODE_OFFSET).toBe(100_000_000);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --testPathPatterns "typeorm-period-charge.repository.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './typeorm-period-charge.repository'`

- [ ] **Step 4: Run test to verify it passes** (Step 1's implementation already exists, so this just confirms the export compiles and the constant is correct)

Run: `npx jest --testPathPatterns "typeorm-period-charge.repository.spec"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/infrastructure/typeorm-period-charge.repository.ts apps/backend/src/modules/payos/infrastructure/typeorm-period-charge.repository.spec.ts
git commit -m "feat: TypeOrmPeriodChargeRepository with orderCode offset"
```

---

### Task 7: Audit action/entity types for `PeriodCharge`

**Files:**
- Modify: `apps/backend/src/common/audit/audit.enums.ts`

**Interfaces:**
- Produces: `AuditActionType.PERIOD_CHARGE_CREATE`, `AuditActionType.PERIOD_CHARGE_PAID`, `AuditEntityType.PERIOD_CHARGE`.

- [ ] **Step 1: Add the enum values**

```typescript
// apps/backend/src/common/audit/audit.enums.ts
// In AuditActionType, add after PLAN_UPGRADE_ORDER_CREATE:
  PERIOD_CHARGE_CREATE = 'PERIOD_CHARGE_CREATE',
  PERIOD_CHARGE_PAID = 'PERIOD_CHARGE_PAID',

// In AuditEntityType, add after PLAN_UPGRADE_ORDER:
  PERIOD_CHARGE = 'PeriodCharge',
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/common/audit/audit.enums.ts
git commit -m "feat: add PeriodCharge audit action/entity types"
```

---

### Task 8: `InitiatePeriodChargeUseCase` (+ extract shared `PLAN_PRICE_VND`)

**Files:**
- Create: `apps/backend/src/modules/payos/application/plan-price.ts`
- Modify: `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts` (remove the local `PLAN_PRICE_VND`, import the extracted one — REFACTOR, existing tests must stay green)
- Create: `apps/backend/src/modules/payos/application/initiate-period-charge.usecase.ts`
- Test: `apps/backend/src/modules/payos/application/initiate-period-charge.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPeriodChargeRepository` (Task 4), `ISubscriptionRepository` (existing), `IPayosPaymentAdapter` (existing), `PLAN_PRICE_VND` (this task).
- Produces:
  ```typescript
  export interface InitiatePeriodChargeInput { organizationId: string; returnUrl: string; cancelUrl: string; }
  export interface InitiatePeriodChargeResult { checkoutUrl: string; }
  export class InitiatePeriodChargeUseCase { execute(input: InitiatePeriodChargeInput): Promise<InitiatePeriodChargeResult>; }
  ```

- [ ] **Step 1: Extract `PLAN_PRICE_VND`** (needed by both this use case and the existing upgrade use case — DRY, not duplicated)

```typescript
// apps/backend/src/modules/payos/application/plan-price.ts
import { PlanId } from '@casso-ledger/shared-types';

// PayOS checkout amount per plan — distinct from Subscription's PLAN_CATALOG,
// which tracks usage limits, not price.
export const PLAN_PRICE_VND: Record<PlanId, number> = {
  [PlanId.FREE]: 0,
  [PlanId.STARTER]: 299_000,
  [PlanId.BUSINESS]: 999_000,
  [PlanId.ENTERPRISE]: 2_999_000,
};
```

In `initiate-plan-upgrade-order.usecase.ts`, delete the local `PLAN_PRICE_VND` const declaration (lines defining it) and add:

```typescript
import { PLAN_PRICE_VND } from './plan-price';
```

Run: `npx jest --testPathPatterns "initiate-plan-upgrade-order.usecase.spec"` (from `apps/backend`)
Expected: PASS — this is a pure refactor, the existing test must still be green before continuing.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/initiate-period-charge.usecase.spec.ts
import { PlanId } from '@casso-ledger/shared-types';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import { PeriodCharge } from '../domain/period-charge';
import { InitiatePeriodChargeUseCase } from './initiate-period-charge.usecase';
import type { IPayosPaymentAdapter } from './payos-payment-adapter.port';
import type { IPeriodChargeRepository } from './period-charge-repository.port';

describe('InitiatePeriodChargeUseCase', () => {
  function buildDeps(subscription: Subscription | null) {
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findByOrganizationId: jest.fn().mockResolvedValue(subscription),
      lockAndFindByOrganizationId: jest.fn(),
      countReceivablesInPeriod: jest.fn(),
      countCopilotChatTurnsInPeriod: jest.fn(),
      save: jest.fn(),
    };
    const chargeRepo: jest.Mocked<IPeriodChargeRepository> = {
      create: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          new PeriodCharge({
            id: 'charge-1',
            orderCode: 100_000_001,
            organizationId: input.organizationId,
            planId: input.planId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            status: 'PENDING' as never,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      ),
      lockAndFindByOrderCode: jest.fn(),
      save: jest.fn(),
      findLatestByOrganizationAndPeriodStart: jest.fn(),
    };
    const adapter: jest.Mocked<IPayosPaymentAdapter> = {
      createPaymentLink: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://pay.payos.vn/100000001',
        orderCode: 100_000_001,
      }),
    };
    const useCase = new InitiatePeriodChargeUseCase(
      chargeRepo,
      subscriptionRepo,
      adapter,
    );
    return { useCase, chargeRepo, subscriptionRepo, adapter };
  }

  it('creates a PeriodCharge for the current period and returns a checkout URL', async () => {
    const subscription = Subscription.createStarter(
      'sub-1',
      'org-1',
      new Date('2026-08-01T00:00:00Z'),
    );
    const { useCase, chargeRepo, adapter } = buildDeps(subscription);

    const result = await useCase.execute({
      organizationId: 'org-1',
      returnUrl: 'https://app.casso.vn/billing?status=success',
      cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
    });

    expect(result.checkoutUrl).toBe('https://pay.payos.vn/100000001');
    expect(chargeRepo.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      planId: PlanId.STARTER,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    });
    expect(adapter.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ orderCode: 100_000_001, amount: 299_000 }),
    );
  });

  it('throws INVALID_PLAN_TRANSITION for a FREE subscription (nothing to renew)', async () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-01T00:00:00Z'),
    );
    const { useCase, chargeRepo } = buildDeps(subscription);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_PLAN_TRANSITION' });
    expect(chargeRepo.create).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the organization has no subscription', async () => {
    const { useCase } = buildDeps(null);
    await expect(
      useCase.execute({
        organizationId: 'org-1',
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --testPathPatterns "initiate-period-charge.usecase.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './initiate-period-charge.usecase'`

- [ ] **Step 4: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/initiate-period-charge.usecase.ts
import { PlanId } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { PLAN_PRICE_VND } from './plan-price';
import {
  type IPayosPaymentAdapter,
  PAYOS_PAYMENT_ADAPTER,
} from './payos-payment-adapter.port';
import {
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';

export interface InitiatePeriodChargeInput {
  organizationId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface InitiatePeriodChargeResult {
  checkoutUrl: string;
}

@Injectable()
export class InitiatePeriodChargeUseCase {
  constructor(
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(PAYOS_PAYMENT_ADAPTER)
    private readonly payosAdapter: IPayosPaymentAdapter,
  ) {}

  async execute(
    input: InitiatePeriodChargeInput,
  ): Promise<InitiatePeriodChargeResult> {
    const subscription = await this.subscriptionRepo.findByOrganizationId(
      input.organizationId,
    );
    if (!subscription) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy gói đăng ký của tổ chức.',
      );
    }
    if (subscription.planId === PlanId.FREE) {
      throw new AppError(
        ErrorCode.INVALID_PLAN_TRANSITION,
        'Gói FREE không cần gia hạn.',
      );
    }

    const charge = await this.chargeRepo.create({
      organizationId: input.organizationId,
      planId: subscription.planId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    });

    const link = await this.payosAdapter.createPaymentLink({
      orderCode: charge.orderCode,
      amount: PLAN_PRICE_VND[subscription.planId],
      description: `Gia han goi ${subscription.planId}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    return { checkoutUrl: link.checkoutUrl };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPatterns "initiate-period-charge.usecase.spec"`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payos/application/plan-price.ts apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts apps/backend/src/modules/payos/application/initiate-period-charge.usecase.ts apps/backend/src/modules/payos/application/initiate-period-charge.usecase.spec.ts
git commit -m "feat: InitiatePeriodChargeUseCase, extract shared PLAN_PRICE_VND"
```

---

### Task 9: `ConfirmPeriodChargeUseCase`

**Files:**
- Create: `apps/backend/src/modules/payos/application/confirm-period-charge.usecase.ts`
- Test: `apps/backend/src/modules/payos/application/confirm-period-charge.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPeriodChargeRepository` (Task 4), `IAuditLogRepository` (existing), `AuditActionType.PERIOD_CHARGE_PAID`/`AuditEntityType.PERIOD_CHARGE` (Task 7), `DataSource` from `typeorm`.
- Produces:
  ```typescript
  export interface ConfirmPeriodChargeInput { orderCode: number; paymentSucceeded: boolean; }
  export class ConfirmPeriodChargeUseCase { execute(input: ConfirmPeriodChargeInput): Promise<void>; }
  ```

Unlike `ConfirmPlanUpgradeOrderUseCase`, this does **not** call any plan-change use case — the `planId` doesn't change on a period renewal, only the `PeriodCharge`'s own status.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/confirm-period-charge.usecase.spec.ts
import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';
import { DataSource } from 'typeorm';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import { PeriodCharge } from '../domain/period-charge';
import { ConfirmPeriodChargeUseCase } from './confirm-period-charge.usecase';
import type { IPeriodChargeRepository } from './period-charge-repository.port';

function buildCharge(status = PeriodChargeStatus.PENDING): PeriodCharge {
  return new PeriodCharge({
    id: 'charge-1',
    orderCode: 100_000_001,
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ConfirmPeriodChargeUseCase', () => {
  function buildDeps(existingCharge: PeriodCharge | null) {
    const chargeRepo: jest.Mocked<IPeriodChargeRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn().mockResolvedValue(existingCharge),
      save: jest.fn(),
      findLatestByOrganizationAndPeriodStart: jest.fn(),
    };
    const auditLogRepo: jest.Mocked<IAuditLogRepository> = {
      create: jest.fn(),
      findPage: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
    } as unknown as DataSource;
    const useCase = new ConfirmPeriodChargeUseCase(
      chargeRepo,
      auditLogRepo,
      dataSource,
    );
    return { useCase, chargeRepo, auditLogRepo };
  }

  it('on success, marks the charge PAID and writes an audit log', async () => {
    const { useCase, chargeRepo, auditLogRepo } = buildDeps(buildCharge());
    await useCase.execute({ orderCode: 100_000_001, paymentSucceeded: true });

    expect(chargeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PeriodChargeStatus.PAID }),
      expect.anything(),
      'org-1',
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'system' }),
      expect.anything(),
    );
  });

  it('on failure code, marks the charge FAILED', async () => {
    const { useCase, chargeRepo } = buildDeps(buildCharge());
    await useCase.execute({ orderCode: 100_000_001, paymentSucceeded: false });

    expect(chargeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PeriodChargeStatus.FAILED }),
      expect.anything(),
      'org-1',
    );
  });

  it('is idempotent: a webhook replay for an already-terminal charge is a no-op', async () => {
    const { useCase, chargeRepo } = buildDeps(
      buildCharge(PeriodChargeStatus.PAID),
    );
    await useCase.execute({ orderCode: 100_000_001, paymentSucceeded: true });
    expect(chargeRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op when orderCode belongs to a different order type (not found)', async () => {
    const { useCase, chargeRepo } = buildDeps(null);
    await expect(
      useCase.execute({ orderCode: 5, paymentSucceeded: true }),
    ).resolves.toBeUndefined();
    expect(chargeRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "confirm-period-charge.usecase.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './confirm-period-charge.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/confirm-period-charge.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import {
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';

export interface ConfirmPeriodChargeInput {
  orderCode: number;
  paymentSucceeded: boolean;
}

@Injectable()
export class ConfirmPeriodChargeUseCase {
  constructor(
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ConfirmPeriodChargeInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const charge = await this.chargeRepo.lockAndFindByOrderCode(
        input.orderCode,
        manager,
      );
      if (!charge || charge.isTerminal()) return;

      if (!input.paymentSucceeded) {
        await this.chargeRepo.save(
          charge.markFailed(),
          manager,
          charge.organizationId,
        );
        return;
      }

      const paidCharge = charge.markPaid();
      await this.chargeRepo.save(paidCharge, manager, charge.organizationId);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: charge.organizationId,
          userId: 'system',
          actionType: AuditActionType.PERIOD_CHARGE_PAID,
          entityType: AuditEntityType.PERIOD_CHARGE,
          entityId: charge.organizationId,
          beforeState: null,
          afterState: {
            planId: charge.planId,
            orderCode: charge.orderCode,
            periodStart: charge.periodStart.toISOString(),
            periodEnd: charge.periodEnd.toISOString(),
          },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns "confirm-period-charge.usecase.spec"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/application/confirm-period-charge.usecase.ts apps/backend/src/modules/payos/application/confirm-period-charge.usecase.spec.ts
git commit -m "feat: ConfirmPeriodChargeUseCase (webhook-driven renewal confirmation)"
```

---

### Task 10: Wire `PayosController` — `POST /payos/period-charges` + dual webhook confirm

**Files:**
- Create: `apps/backend/src/modules/payos/presentation/dto/is-allowed-payos-redirect-uri.decorator.ts` (extracted from `initiate-plan-upgrade-order.dto.ts` so both DTOs can use it — REFACTOR)
- Modify: `apps/backend/src/modules/payos/presentation/dto/initiate-plan-upgrade-order.dto.ts` (import the extracted decorator instead of declaring it locally)
- Create: `apps/backend/src/modules/payos/presentation/dto/initiate-period-charge.dto.ts`
- Create: `apps/backend/src/modules/payos/presentation/dto/period-charge-response.dto.ts`
- Modify: `apps/backend/src/modules/payos/presentation/payos.controller.ts`
- Test: `apps/backend/src/modules/payos/presentation/payos.controller.spec.ts` (new — the controller currently has no dedicated unit spec, only e2e coverage; adding one here since we're adding branching logic to `receiveWebhook`)

**Interfaces:**
- Consumes: `InitiatePeriodChargeUseCase` (Task 8), `ConfirmPeriodChargeUseCase` (Task 9).
- Produces: `POST /api/v1/payos/period-charges` (auth required, `SUBSCRIPTION_MANAGE`, idempotency-key); `POST /api/v1/payos/webhook` now calls both `ConfirmPlanUpgradeOrderUseCase` and `ConfirmPeriodChargeUseCase` — safe because their orderCode spaces never overlap (Task 6).

- [ ] **Step 1: Extract the redirect-URI validator decorator**

```typescript
// apps/backend/src/modules/payos/presentation/dto/is-allowed-payos-redirect-uri.decorator.ts
import { registerDecorator, type ValidationOptions } from 'class-validator';
import {
  isPayosRedirectUriAllowed,
  parsePayosRedirectUriAllowlist,
} from '../../application/validate-payos-redirect-uri';

export function IsAllowedPayosRedirectUri(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAllowedPayosRedirectUri',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true;
          return isPayosRedirectUriAllowed(
            value,
            parsePayosRedirectUriAllowlist(
              process.env.PAYOS_RETURN_URL_ALLOWLIST,
            ),
          );
        },
        defaultMessage: () => 'Địa chỉ chuyển hướng không được phép.',
      },
    });
  };
}
```

Update `initiate-plan-upgrade-order.dto.ts`: delete the local `IsAllowedPayosRedirectUri` function definition and its `registerDecorator`/`class-validator` imports it no longer needs, replace with:

```typescript
import { IsAllowedPayosRedirectUri } from './is-allowed-payos-redirect-uri.decorator';
```

Run: `npx jest --testPathPatterns "initiate-plan-upgrade-order.dto|validate-payos-redirect-uri"` (from `apps/backend`) — no existing spec directly tests this DTO's decorator wiring, so also run the full payos suite to confirm nothing broke:

Run: `npx jest --testPathPatterns "payos"`
Expected: PASS (all existing payos tests still green after the extraction)

- [ ] **Step 2: Write the new DTOs**

```typescript
// apps/backend/src/modules/payos/presentation/dto/initiate-period-charge.dto.ts
import { IsUrl } from 'class-validator';
import { IsAllowedPayosRedirectUri } from './is-allowed-payos-redirect-uri.decorator';

export class InitiatePeriodChargeDto {
  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  returnUrl: string;

  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  cancelUrl: string;
}
```

```typescript
// apps/backend/src/modules/payos/presentation/dto/period-charge-response.dto.ts
export interface PeriodChargeResponseDto {
  checkoutUrl: string;
}
```

- [ ] **Step 3: Write the failing controller test**

```typescript
// apps/backend/src/modules/payos/presentation/payos.controller.spec.ts
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ConfirmPeriodChargeUseCase } from '../application/confirm-period-charge.usecase';
import { ConfirmPlanUpgradeOrderUseCase } from '../application/confirm-plan-upgrade-order.usecase';
import { InitiatePeriodChargeUseCase } from '../application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { PayosController } from './payos.controller';

describe('PayosController', () => {
  function buildController() {
    const initiateUseCase = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://x' }),
    } as unknown as InitiatePlanUpgradeOrderUseCase;
    const confirmUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConfirmPlanUpgradeOrderUseCase;
    const initiateChargeUseCase = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://y' }),
    } as unknown as InitiatePeriodChargeUseCase;
    const confirmChargeUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConfirmPeriodChargeUseCase;
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    } as unknown as TenantContextService;
    const idempotency = {
      execute: jest.fn((_key, _headerKey, _dto, fn) => fn()),
    } as unknown as IdempotencyService;

    const controller = new PayosController(
      initiateUseCase,
      confirmUseCase,
      initiateChargeUseCase,
      confirmChargeUseCase,
      tenantContext,
      idempotency,
    );
    return { controller, confirmUseCase, confirmChargeUseCase };
  }

  it('receiveWebhook calls BOTH confirm use cases (orderCode spaces are disjoint, so at most one ever matches a real row)', async () => {
    const { controller, confirmUseCase, confirmChargeUseCase } =
      buildController();

    await controller.receiveWebhook({
      code: '00',
      desc: 'success',
      success: true,
      data: {
        orderCode: 100_000_001,
        amount: 299_000,
        description: 'x',
        code: '00',
        desc: 'success',
      },
      signature: 'sig',
    });

    expect(confirmUseCase.execute).toHaveBeenCalledWith({
      orderCode: 100_000_001,
      paymentSucceeded: true,
    });
    expect(confirmChargeUseCase.execute).toHaveBeenCalledWith({
      orderCode: 100_000_001,
      paymentSucceeded: true,
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --testPathPatterns "payos.controller.spec"` (from `apps/backend`)
Expected: FAIL — constructor arity mismatch (`PayosController` doesn't accept `initiateChargeUseCase`/`confirmChargeUseCase` yet)

- [ ] **Step 5: Update the controller**

```typescript
// apps/backend/src/modules/payos/presentation/payos.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { Public } from '../../../common/auth/public.decorator';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { WebhookRateLimitGuard } from '../../webhooks/presentation/webhook-rate-limit.guard';
import { ConfirmPeriodChargeUseCase } from '../application/confirm-period-charge.usecase';
import { ConfirmPlanUpgradeOrderUseCase } from '../application/confirm-plan-upgrade-order.usecase';
import { InitiatePeriodChargeUseCase } from '../application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { InitiatePeriodChargeDto } from './dto/initiate-period-charge.dto';
import { InitiatePlanUpgradeOrderDto } from './dto/initiate-plan-upgrade-order.dto';
import type { PeriodChargeResponseDto } from './dto/period-charge-response.dto';
import { PayosWebhookDto } from './dto/payos-webhook.dto';
import type { PlanUpgradeOrderResponseDto } from './dto/plan-upgrade-order-response.dto';
import { PayosWebhookAuthGuard } from './payos-webhook-auth.guard';

@Controller('payos')
@UseGuards(PermissionGuard)
export class PayosController {
  constructor(
    private readonly initiateUseCase: InitiatePlanUpgradeOrderUseCase,
    private readonly confirmUseCase: ConfirmPlanUpgradeOrderUseCase,
    private readonly initiateChargeUseCase: InitiatePeriodChargeUseCase,
    private readonly confirmChargeUseCase: ConfirmPeriodChargeUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('plan-upgrade-orders')
  @Audited(
    AuditActionType.PLAN_UPGRADE_ORDER_CREATE,
    AuditEntityType.PLAN_UPGRADE_ORDER,
  )
  @RequirePermission(Permission.SUBSCRIPTION_MANAGE)
  async initiate(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiatePlanUpgradeOrderDto,
  ): Promise<PlanUpgradeOrderResponseDto> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.idempotency.execute(
      'POST /payos/plan-upgrade-orders',
      key,
      dto,
      async () =>
        this.initiateUseCase.execute({
          organizationId,
          targetPlanId: dto.targetPlanId,
          returnUrl: dto.returnUrl,
          cancelUrl: dto.cancelUrl,
        }),
    );
  }

  @Post('period-charges')
  @Audited(
    AuditActionType.PERIOD_CHARGE_CREATE,
    AuditEntityType.PERIOD_CHARGE,
  )
  @RequirePermission(Permission.SUBSCRIPTION_MANAGE)
  async initiatePeriodCharge(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiatePeriodChargeDto,
  ): Promise<PeriodChargeResponseDto> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.idempotency.execute(
      'POST /payos/period-charges',
      key,
      dto,
      async () =>
        this.initiateChargeUseCase.execute({
          organizationId,
          returnUrl: dto.returnUrl,
          cancelUrl: dto.cancelUrl,
        }),
    );
  }

  @Post('webhook')
  @Public()
  @UseGuards(PayosWebhookAuthGuard, WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveWebhook(
    @Body() payload: PayosWebhookDto,
  ): Promise<{ received: true }> {
    const input = {
      orderCode: payload.data.orderCode,
      paymentSucceeded: payload.code === '00',
    };
    // Both use cases no-op if the orderCode isn't theirs (Task 6's offset
    // makes the two spaces disjoint, so at most one of these ever matches).
    await this.confirmUseCase.execute(input);
    await this.confirmChargeUseCase.execute(input);
    return { received: true };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPatterns "payos.controller.spec"`
Expected: PASS

- [ ] **Step 7: Run the full payos suite to confirm the DTO extraction and controller change didn't break anything existing**

Run: `npx jest --testPathPatterns "payos"`
Expected: PASS (all payos tests, old and new)

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/payos/presentation
git commit -m "feat: wire POST /payos/period-charges and dual webhook confirm"
```

---

### Task 11: `ISubscriptionRepository.findAllPaidTierActive()`

**Files:**
- Modify: `apps/backend/src/modules/billing/application/subscription-repository.port.ts`
- Modify: `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts`
- Test: `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.spec.ts`

**Interfaces:**
- Produces: `findAllPaidTierActive(): Promise<Subscription[]>` — a system-wide, cross-tenant read (like `IOrganizationRepository.findAllIds()`), used by the two new cron scanners (Tasks 13, 14). Deliberately does not go through `BaseRepository`'s tenant-scoped helpers.

- [ ] **Step 1: Read the existing spec file first**

Open `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.spec.ts` to match its existing test-container setup style before adding to it.

- [ ] **Step 2: Write the failing test** (append to the existing spec's `describe` block)

```typescript
  it('findAllPaidTierActive returns only ACTIVE, non-FREE subscriptions', async () => {
    const now = new Date();
    const period = {
      currentPeriodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      currentPeriodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      createdAt: now,
      receivableMonthlyLimit: 1,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 1,
      canUseCustomSmtp: false,
    };
    await dataSource.getRepository(SubscriptionOrmEntity).save([
      { id: 'f1', organizationId: 'org-free', planId: PlanId.FREE, status: SubscriptionStatus.ACTIVE, ...period },
      { id: 'p1', organizationId: 'org-paid-active', planId: PlanId.STARTER, status: SubscriptionStatus.ACTIVE, ...period },
      { id: 'p2', organizationId: 'org-paid-cancelled', planId: PlanId.BUSINESS, status: SubscriptionStatus.CANCELLED, ...period },
    ]);

    const result = await repository.findAllPaidTierActive();
    const orgIds = result.map((s) => s.organizationId);

    expect(orgIds).toContain('org-paid-active');
    expect(orgIds).not.toContain('org-free');
    expect(orgIds).not.toContain('org-paid-cancelled');
  });
```

(Adjust the exact `dataSource`/`repository` variable names to match whatever the existing spec's `beforeAll`/`beforeEach` already defines — read the file first per Step 1.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --testPathPatterns "typeorm-subscription.repository.spec"` (from `apps/backend`)
Expected: FAIL — `repository.findAllPaidTierActive is not a function`

- [ ] **Step 4: Add the port method**

```typescript
// apps/backend/src/modules/billing/application/subscription-repository.port.ts
// Add to the ISubscriptionRepository interface:
  // System-wide, cross-tenant read for the renewal-reminder and non-renewal
  // downgrade crons (payos module) — mirrors IOrganizationRepository.findAllIds().
  findAllPaidTierActive(): Promise<Subscription[]>;
```

- [ ] **Step 5: Implement it**

```typescript
// apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts
// Add this import at the top:
import { Not } from 'typeorm';
// Add this method to TypeOrmSubscriptionRepository:
  async findAllPaidTierActive(): Promise<Subscription[]> {
    const rows = await this.ormRepo.find({
      where: { planId: Not(PlanId.FREE), status: SubscriptionStatus.ACTIVE },
    });
    return rows.map((row) => new Subscription(row));
  }
```

(`PlanId` and `SubscriptionStatus` are already imported in this file via `@casso-ledger/shared-types` — confirm before adding a duplicate import.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPatterns "typeorm-subscription.repository.spec"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/billing/application/subscription-repository.port.ts apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.spec.ts
git commit -m "feat: ISubscriptionRepository.findAllPaidTierActive for renewal crons"
```

---

### Task 12: `existsPaidWithinRange` on `IPlanUpgradeOrderRepository` + `PeriodPaymentStatusService`

**Files:**
- Modify: `apps/backend/src/modules/payos/application/plan-upgrade-order-repository.port.ts`
- Modify: `apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.ts`
- Modify: `apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.spec.ts` (add the new mock method — see Step 8)
- Modify: `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts` (add the new mock method — see Step 8)
- Create: `apps/backend/src/modules/payos/application/period-payment-status.service.ts`
- Test: `apps/backend/src/modules/payos/application/period-payment-status.service.spec.ts`

**Interfaces:**
- Consumes: `IPeriodChargeRepository.findLatestByOrganizationAndPeriodStart` (Task 4), new `IPlanUpgradeOrderRepository.existsPaidWithinRange` (this task).
- Produces:
  ```typescript
  export class PeriodPaymentStatusService {
    hasPaidCurrentPeriod(subscription: Subscription): Promise<boolean>;
  }
  ```
  — the single shared rule used by both cron scanners (Tasks 13, 14): "has this org paid to keep its current-tier subscription through the current period," per decision #2 (an upgrade that landed in this period counts).

- [ ] **Step 1: Add the port method**

```typescript
// apps/backend/src/modules/payos/application/plan-upgrade-order-repository.port.ts
// Add to IPlanUpgradeOrderRepository:
  // Used by PeriodPaymentStatusService: a PAID PlanUpgradeOrder that landed
  // inside the current billing period counts as that period's payment (the
  // org doesn't also need a separate PeriodCharge for the period it upgraded in).
  existsPaidWithinRange(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean>;
```

- [ ] **Step 2: Implement it**

```typescript
// apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.ts
// Add this method to TypeOrmPlanUpgradeOrderRepository:
  async existsPaidWithinRange(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean> {
    const count = await this.ormRepo.count({
      where: {
        organizationId,
        status: PlanUpgradeOrderStatus.PAID,
        updatedAt: Between(periodStart, periodEnd),
      },
    });
    return count > 0;
  }
```

Add `Between` to the `typeorm` import at the top of the file, and `PlanUpgradeOrderStatus` from `@casso-ledger/shared-types` (already imported in this file — confirm before duplicating).

- [ ] **Step 3: Write the failing test for `PeriodPaymentStatusService`**

```typescript
// apps/backend/src/modules/payos/application/period-payment-status.service.spec.ts
import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';
import { Subscription } from '../../billing/domain/subscription';
import { PeriodCharge } from '../domain/period-charge';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';
import { PeriodPaymentStatusService } from './period-payment-status.service';
import type { IPeriodChargeRepository } from './period-charge-repository.port';

function buildSubscription(): Subscription {
  return Subscription.createStarter(
    'sub-1',
    'org-1',
    new Date('2026-08-01T00:00:00Z'),
  );
}

describe('PeriodPaymentStatusService', () => {
  function buildDeps() {
    const chargeRepo: jest.Mocked<IPeriodChargeRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn(),
      save: jest.fn(),
      findLatestByOrganizationAndPeriodStart: jest.fn(),
    };
    const upgradeOrderRepo: jest.Mocked<IPlanUpgradeOrderRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn(),
      save: jest.fn(),
      existsPaidWithinRange: jest.fn(),
    };
    const service = new PeriodPaymentStatusService(chargeRepo, upgradeOrderRepo);
    return { service, chargeRepo, upgradeOrderRepo };
  }

  it('returns true when a PAID PeriodCharge exists for the current period', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(
      new PeriodCharge({
        id: 'c1',
        orderCode: 100_000_001,
        organizationId: 'org-1',
        planId: PlanId.STARTER,
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
        status: PeriodChargeStatus.PAID,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const result = await service.hasPaidCurrentPeriod(buildSubscription());
    expect(result).toBe(true);
    expect(upgradeOrderRepo.existsPaidWithinRange).not.toHaveBeenCalled();
  });

  it('falls back to checking a PAID PlanUpgradeOrder within the period when no PeriodCharge exists', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(null);
    upgradeOrderRepo.existsPaidWithinRange.mockResolvedValue(true);

    const subscription = buildSubscription();
    const result = await service.hasPaidCurrentPeriod(subscription);

    expect(result).toBe(true);
    expect(upgradeOrderRepo.existsPaidWithinRange).toHaveBeenCalledWith(
      'org-1',
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
  });

  it('returns false when neither a PAID PeriodCharge nor a PAID PlanUpgradeOrder covers the period', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(null);
    upgradeOrderRepo.existsPaidWithinRange.mockResolvedValue(false);

    const result = await service.hasPaidCurrentPeriod(buildSubscription());
    expect(result).toBe(false);
  });

  it('returns false when the latest PeriodCharge for the period is still PENDING/FAILED', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(
      new PeriodCharge({
        id: 'c1',
        orderCode: 100_000_001,
        organizationId: 'org-1',
        planId: PlanId.STARTER,
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
        status: PeriodChargeStatus.FAILED,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    upgradeOrderRepo.existsPaidWithinRange.mockResolvedValue(false);

    const result = await service.hasPaidCurrentPeriod(buildSubscription());
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --testPathPatterns "period-payment-status.service.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './period-payment-status.service'`

- [ ] **Step 5: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/period-payment-status.service.ts
import { PeriodChargeStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { Subscription } from '../../billing/domain/subscription';
import {
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';
import {
  type IPlanUpgradeOrderRepository,
  PLAN_UPGRADE_ORDER_REPOSITORY,
} from './plan-upgrade-order-repository.port';

@Injectable()
export class PeriodPaymentStatusService {
  constructor(
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly upgradeOrderRepo: IPlanUpgradeOrderRepository,
  ) {}

  // "Has this org paid to keep its current-tier subscription through its
  // current billing period" — a PAID PeriodCharge scoped to this exact period
  // counts, OR a PAID PlanUpgradeOrder that landed inside this period (the
  // period an upgrade lands in is covered by the upgrade payment itself).
  async hasPaidCurrentPeriod(subscription: Subscription): Promise<boolean> {
    const charge = await this.chargeRepo.findLatestByOrganizationAndPeriodStart(
      subscription.organizationId,
      subscription.currentPeriodStart,
    );
    if (charge?.status === PeriodChargeStatus.PAID) return true;

    return this.upgradeOrderRepo.existsPaidWithinRange(
      subscription.organizationId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPatterns "period-payment-status.service.spec"`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the full payos + billing suites to confirm the new port method didn't break the existing PlanUpgradeOrder mocks elsewhere**

Run: `npx jest --testPathPatterns "payos|billing"`
Expected: PASS — if any existing test mocks `IPlanUpgradeOrderRepository` without `existsPaidWithinRange`, TypeScript will catch it at compile time (Step 8); Jest itself won't fail on an extra missing mock method unless it's actually called.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS. Adding a required method to `IPlanUpgradeOrderRepository` breaks the excess/missing-property check on every existing `jest.Mocked<IPlanUpgradeOrderRepository>` object literal built before this task — namely `apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.spec.ts` and `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts` (both already on `main` from PR #156). Add `existsPaidWithinRange: jest.fn()` to the mock object literal in each.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/payos/application/plan-upgrade-order-repository.port.ts apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.ts apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.spec.ts apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts apps/backend/src/modules/payos/application/period-payment-status.service.ts apps/backend/src/modules/payos/application/period-payment-status.service.spec.ts
git commit -m "feat: PeriodPaymentStatusService — shared has-paid-current-period check"
```

---

### Task 13: `RenewalReminderScannerService` (cron)

**Files:**
- Create: `apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.ts`
- Test: `apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.spec.ts`

**Interfaces:**
- Consumes: `ISubscriptionRepository.findAllPaidTierActive` (Task 11), `PeriodPaymentStatusService` (Task 12), `InitiatePeriodChargeUseCase` (Task 8), `IMembershipRepository`/`IUserRepository` (existing, `organizations`/`users` modules), `IEmailQueue`/`EMAIL_QUEUE_PORT` (existing, `notifications` module — reuses the `'send-owner-alert'` job type as-is, no new job type needed), `TenantContextService`.
- Produces: `RenewalReminderScannerService.scan(now?: Date): Promise<void>`, `@Cron`-decorated, exported constant `RENEWAL_REMINDER_LEAD_DAYS = 3`.

Fires **exactly once** per period — the day `currentPeriodEnd` is `RENEWAL_REMINDER_LEAD_DAYS` away — not a range, so it never creates duplicate `PeriodCharge` rows for the same period across consecutive daily runs.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.spec.ts
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import type { IEmailQueue } from '../../notifications/application/email-queue.port';
import type { IMembershipRepository } from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import type { IUserRepository } from '../../users/application/user-repository.port';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { InitiatePeriodChargeUseCase } from './initiate-period-charge.usecase';
import type { PeriodPaymentStatusService } from './period-payment-status.service';
import { RenewalReminderScannerService } from './renewal-reminder-scanner.service';

function buildSubscriptionEndingIn(days: number): Subscription {
  const now = new Date('2026-08-28T00:00:00Z');
  const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return new Subscription({
    id: 'sub-1',
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    createdAt: now,
    version: 1,
  });
}

describe('RenewalReminderScannerService', () => {
  function buildDeps(subscription: Subscription) {
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findAllPaidTierActive: jest.fn().mockResolvedValue([subscription]),
      findByOrganizationId: jest.fn(),
      lockAndFindByOrganizationId: jest.fn(),
      countReceivablesInPeriod: jest.fn(),
      countCopilotChatTurnsInPeriod: jest.fn(),
      save: jest.fn(),
    };
    const paymentStatus = {
      hasPaidCurrentPeriod: jest.fn().mockResolvedValue(false),
    } as unknown as PeriodPaymentStatusService;
    const initiateCharge = {
      execute: jest.fn().mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/x' }),
    } as unknown as InitiatePeriodChargeUseCase;
    const membershipRepo: jest.Mocked<IMembershipRepository> = {
      findOwnerByOrganization: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    } as never;
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue({ email: 'owner@example.com' }),
    } as never;
    const emailQueue: jest.Mocked<IEmailQueue> = {
      add: jest.fn(),
    } as never;
    const tenantContext = {
      run: jest.fn((_user, fn) => fn()),
    } as unknown as TenantContextService;

    const service = new RenewalReminderScannerService(
      subscriptionRepo,
      paymentStatus,
      initiateCharge,
      membershipRepo,
      userRepo,
      emailQueue,
      tenantContext,
    );
    return { service, initiateCharge, emailQueue, paymentStatus };
  }

  it('sends a reminder + creates a PeriodCharge exactly 3 days before period end when unpaid', async () => {
    const subscription = buildSubscriptionEndingIn(3);
    const { service, initiateCharge, emailQueue } = buildDeps(subscription);

    await service.scan(new Date('2026-08-28T00:00:00Z'));

    expect(initiateCharge.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-owner-alert',
      expect.objectContaining({
        organizationId: 'org-1',
        to: 'owner@example.com',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('org-1'),
      }),
    );
  });

  it('does nothing when period end is not exactly the lead-day mark', async () => {
    const subscription = buildSubscriptionEndingIn(10);
    const { service, initiateCharge } = buildDeps(subscription);

    await service.scan(new Date('2026-08-28T00:00:00Z'));

    expect(initiateCharge.execute).not.toHaveBeenCalled();
  });

  it('does nothing when the current period is already paid', async () => {
    const subscription = buildSubscriptionEndingIn(3);
    const { service, initiateCharge, paymentStatus } = buildDeps(subscription);
    (paymentStatus.hasPaidCurrentPeriod as jest.Mock).mockResolvedValue(true);

    await service.scan(new Date('2026-08-28T00:00:00Z'));

    expect(initiateCharge.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "renewal-reminder-scanner.service.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './renewal-reminder-scanner.service'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SUBSCRIPTION_REPOSITORY } from '../../billing/application/subscription-repository.port';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import type { Subscription } from '../../billing/domain/subscription';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../../notifications/application/email-queue.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { InitiatePeriodChargeUseCase } from './initiate-period-charge.usecase';
import { PeriodPaymentStatusService } from './period-payment-status.service';

export const RENEWAL_REMINDER_LEAD_DAYS = 3;
export const RENEWAL_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calendarDaysUntil(target: Date, now: Date): number {
  return Math.round((target.getTime() - now.getTime()) / MS_PER_DAY);
}

@Injectable()
export class RenewalReminderScannerService {
  private readonly logger = new Logger(RenewalReminderScannerService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly paymentStatus: PeriodPaymentStatusService,
    private readonly initiateCharge: InitiatePeriodChargeUseCase,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(EMAIL_QUEUE_PORT)
    private readonly emailQueue: IEmailQueue,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron('0 3 * * *', { timeZone: RENEWAL_TIMEZONE })
  async scan(now: Date = new Date()): Promise<void> {
    const subscriptions = await this.subscriptionRepo.findAllPaidTierActive();
    for (const subscription of subscriptions) {
      try {
        await this.scanSubscription(subscription, now);
      } catch (error) {
        this.logger.error({
          message: 'Failed to scan subscription for renewal reminder',
          organizationId: subscription.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async scanSubscription(
    subscription: Subscription,
    now: Date,
  ): Promise<void> {
    const daysUntilPeriodEnd = calendarDaysUntil(
      subscription.currentPeriodEnd,
      now,
    );
    if (daysUntilPeriodEnd !== RENEWAL_REMINDER_LEAD_DAYS) return;

    const alreadyPaid = await this.paymentStatus.hasPaidCurrentPeriod(
      subscription,
    );
    if (alreadyPaid) return;

    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: subscription.organizationId,
        role: Role.OWNER,
      },
      async () => {
        const { checkoutUrl } = await this.initiateCharge.execute({
          organizationId: subscription.organizationId,
          returnUrl: 'https://app.casso.vn/billing?status=success',
          cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
        });

        const membership = await this.membershipRepo.findOwnerByOrganization(
          subscription.organizationId,
        );
        const owner = membership
          ? await this.userRepo.findById(membership.userId)
          : null;
        if (!owner?.email) return;

        await this.emailQueue.add(
          'send-owner-alert',
          {
            organizationId: subscription.organizationId,
            to: owner.email,
            subject: `Gói ${subscription.planId} của bạn sắp hết hạn`,
            html: `<p>Gói ${subscription.planId} của bạn sẽ hết hạn vào ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}. Vui lòng thanh toán để tiếp tục sử dụng: <a href="${checkoutUrl}">${checkoutUrl}</a></p>`,
          },
          {
            jobId: `renewal-reminder-${subscription.organizationId}-${subscription.currentPeriodStart.toISOString().slice(0, 10)}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns "renewal-reminder-scanner.service.spec"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.ts apps/backend/src/modules/payos/application/renewal-reminder-scanner.service.spec.ts
git commit -m "feat: RenewalReminderScannerService (daily cron)"
```

---

### Task 14: `NonRenewalDowngradeScannerService` (cron)

**Files:**
- Create: `apps/backend/src/modules/payos/application/non-renewal-downgrade-scanner.service.ts`
- Test: `apps/backend/src/modules/payos/application/non-renewal-downgrade-scanner.service.spec.ts`

**Interfaces:**
- Consumes: `ISubscriptionRepository.findAllPaidTierActive`/`lockAndFindByOrganizationId`/`save` (existing + Task 11), `PeriodPaymentStatusService` (Task 12), `Subscription.revertToFreeForNonRenewal` (Task 3), `IAuditLogRepository`, `DataSource`.
- Produces: `NonRenewalDowngradeScannerService.scan(now?: Date): Promise<void>`, `@Cron`-decorated, exported constant `NON_RENEWAL_GRACE_DAYS = 3`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/non-renewal-downgrade-scanner.service.spec.ts
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { DataSource } from 'typeorm';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import type { PeriodPaymentStatusService } from './period-payment-status.service';
import { NonRenewalDowngradeScannerService } from './non-renewal-downgrade-scanner.service';

function buildSubscriptionPeriodEndedDaysAgo(days: number): Subscription {
  const periodEnd = new Date(
    new Date('2026-09-04T00:00:00Z').getTime() - days * 24 * 60 * 60 * 1000,
  );
  const periodStart = new Date(
    periodEnd.getTime() - 31 * 24 * 60 * 60 * 1000,
  );
  return new Subscription({
    id: 'sub-1',
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    createdAt: periodStart,
    version: 1,
  });
}

describe('NonRenewalDowngradeScannerService', () => {
  function buildDeps(subscription: Subscription, paid: boolean) {
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findAllPaidTierActive: jest.fn().mockResolvedValue([subscription]),
      lockAndFindByOrganizationId: jest.fn().mockResolvedValue(subscription),
      findByOrganizationId: jest.fn(),
      countReceivablesInPeriod: jest.fn(),
      countCopilotChatTurnsInPeriod: jest.fn(),
      save: jest.fn(),
    };
    const paymentStatus = {
      hasPaidCurrentPeriod: jest.fn().mockResolvedValue(paid),
    } as unknown as PeriodPaymentStatusService;
    const auditLogRepo: jest.Mocked<IAuditLogRepository> = {
      create: jest.fn(),
      findPage: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
    } as unknown as DataSource;

    const service = new NonRenewalDowngradeScannerService(
      subscriptionRepo,
      paymentStatus,
      auditLogRepo,
      dataSource,
    );
    return { service, subscriptionRepo, auditLogRepo };
  }

  it('downgrades to FREE when the grace window has passed and the period is unpaid', async () => {
    const subscription = buildSubscriptionPeriodEndedDaysAgo(3);
    const { service, subscriptionRepo, auditLogRepo } = buildDeps(
      subscription,
      false,
    );

    await service.scan(new Date('2026-09-04T00:00:00Z'));

    expect(subscriptionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PlanId.FREE }),
      expect.anything(),
      'org-1',
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'system' }),
      expect.anything(),
    );
  });

  it('does nothing while still inside the grace window', async () => {
    const subscription = buildSubscriptionPeriodEndedDaysAgo(1);
    const { service, subscriptionRepo } = buildDeps(subscription, false);

    await service.scan(new Date('2026-09-04T00:00:00Z'));

    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('does nothing when the period was paid', async () => {
    const subscription = buildSubscriptionPeriodEndedDaysAgo(5);
    const { service, subscriptionRepo } = buildDeps(subscription, true);

    await service.scan(new Date('2026-09-04T00:00:00Z'));

    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "non-renewal-downgrade-scanner.service.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './non-renewal-downgrade-scanner.service'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/non-renewal-downgrade-scanner.service.ts
import { PlanId } from '@casso-ledger/shared-types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, type EntityManager } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import type { Subscription } from '../../billing/domain/subscription';
import { PeriodPaymentStatusService } from './period-payment-status.service';
import { RENEWAL_TIMEZONE } from './renewal-reminder-scanner.service';

export const NON_RENEWAL_GRACE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class NonRenewalDowngradeScannerService {
  private readonly logger = new Logger(NonRenewalDowngradeScannerService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly paymentStatus: PeriodPaymentStatusService,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 4 * * *', { timeZone: RENEWAL_TIMEZONE })
  async scan(now: Date = new Date()): Promise<void> {
    const subscriptions = await this.subscriptionRepo.findAllPaidTierActive();
    for (const subscription of subscriptions) {
      try {
        await this.scanSubscription(subscription, now);
      } catch (error) {
        this.logger.error({
          message: 'Failed to scan subscription for non-renewal downgrade',
          organizationId: subscription.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async scanSubscription(
    subscription: Subscription,
    now: Date,
  ): Promise<void> {
    const graceDeadline =
      subscription.currentPeriodEnd.getTime() +
      NON_RENEWAL_GRACE_DAYS * MS_PER_DAY;
    if (now.getTime() < graceDeadline) return;

    const paid = await this.paymentStatus.hasPaidCurrentPeriod(subscription);
    if (paid) return;

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const locked = await this.subscriptionRepo.lockAndFindByOrganizationId(
        subscription.organizationId,
        manager,
      );
      if (!locked || locked.planId === PlanId.FREE) return;

      // Re-check inside the lock in case a webhook confirmed payment between
      // the unlocked read above and acquiring the lock here.
      const stillUnpaid = !(await this.paymentStatus.hasPaidCurrentPeriod(
        locked,
      ));
      if (!stillUnpaid) return;

      const downgraded = locked.revertToFreeForNonRenewal(now);
      await this.subscriptionRepo.save(
        downgraded,
        manager,
        subscription.organizationId,
      );
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: subscription.organizationId,
          userId: 'system',
          actionType: AuditActionType.SUBSCRIPTION_CHANGE_PLAN,
          entityType: AuditEntityType.SUBSCRIPTION,
          entityId: subscription.organizationId,
          beforeState: { planId: locked.planId },
          afterState: { planId: PlanId.FREE, reason: 'non-renewal' },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns "non-renewal-downgrade-scanner.service.spec"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/application/non-renewal-downgrade-scanner.service.ts apps/backend/src/modules/payos/application/non-renewal-downgrade-scanner.service.spec.ts
git commit -m "feat: NonRenewalDowngradeScannerService (daily cron)"
```

---

### Task 15: Wire everything — `payos.module.ts`, `ScheduleModule.forRoot()`

**Files:**
- Modify: `apps/backend/src/modules/payos/payos.module.ts`
- Modify: `apps/backend/src/app.module.ts`

This is configuration-only wiring (AGENTS.md's stated TDD exception) — verified by the full test suite and the e2e test in Task 16, not a dedicated spec.

- [ ] **Step 1: Register `ScheduleModule.forRoot()`**

In `apps/backend/src/app.module.ts`, add the import:

```typescript
import { ScheduleModule } from '@nestjs/schedule';
```

Add `ScheduleModule.forRoot()` to the `imports` array (alongside `EventEmitterModule.forRoot()` — same style, no options needed). This is required for **both** this plan's new crons and the pre-existing `ReminderSchedulerService`'s daily scan to actually run — grep confirmed neither currently does (see "New Technical Finding" above).

- [ ] **Step 2: Wire `payos.module.ts`**

```typescript
// apps/backend/src/modules/payos/payos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ConfirmPeriodChargeUseCase } from './application/confirm-period-charge.usecase';
import { ConfirmPlanUpgradeOrderUseCase } from './application/confirm-plan-upgrade-order.usecase';
import { InitiatePeriodChargeUseCase } from './application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from './application/initiate-plan-upgrade-order.usecase';
import { NonRenewalDowngradeScannerService } from './application/non-renewal-downgrade-scanner.service';
import { PAYOS_PAYMENT_ADAPTER } from './application/payos-payment-adapter.port';
import { PeriodPaymentStatusService } from './application/period-payment-status.service';
import { PERIOD_CHARGE_REPOSITORY } from './application/period-charge-repository.port';
import { PLAN_UPGRADE_ORDER_REPOSITORY } from './application/plan-upgrade-order-repository.port';
import { RenewalReminderScannerService } from './application/renewal-reminder-scanner.service';
import { PayosAdapter } from './infrastructure/payos.adapter';
import { PeriodChargeOrmEntity } from './infrastructure/period-charge.orm-entity';
import { PlanUpgradeOrderOrmEntity } from './infrastructure/plan-upgrade-order.orm-entity';
import { TypeOrmPeriodChargeRepository } from './infrastructure/typeorm-period-charge.repository';
import { TypeOrmPlanUpgradeOrderRepository } from './infrastructure/typeorm-plan-upgrade-order.repository';
import { PayosController } from './presentation/payos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanUpgradeOrderOrmEntity, PeriodChargeOrmEntity]),
    BillingModule,
    WebhooksModule,
    NotificationsModule,
    OrganizationsModule,
    UsersModule,
  ],
  providers: [
    {
      provide: PLAN_UPGRADE_ORDER_REPOSITORY,
      useClass: TypeOrmPlanUpgradeOrderRepository,
    },
    {
      provide: PERIOD_CHARGE_REPOSITORY,
      useClass: TypeOrmPeriodChargeRepository,
    },
    { provide: PAYOS_PAYMENT_ADAPTER, useClass: PayosAdapter },
    InitiatePlanUpgradeOrderUseCase,
    ConfirmPlanUpgradeOrderUseCase,
    InitiatePeriodChargeUseCase,
    ConfirmPeriodChargeUseCase,
    PeriodPaymentStatusService,
    RenewalReminderScannerService,
    NonRenewalDowngradeScannerService,
  ],
  controllers: [PayosController],
})
export class PayosModule {}
```

(`.claude/rules/module-wiring.md` order: `TypeOrmModule.forFeature` first, then dependent modules; provider DI-token bindings first, then use cases/services; controllers last — followed above.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 4: Run the full unit suite**

Run: `npx jest` (from `apps/backend`)
Expected: PASS — all suites, including the pre-existing `reminder-scheduler.service.spec.ts` (unaffected by `ScheduleModule.forRoot()`, since its test calls `.scan()` directly, bypassing the cron trigger).

- [ ] **Step 5: Boot the app locally to confirm no DI wiring errors** (module cycles, missing providers)

Run: `pnpm dev:backend` (from repo root, or `npm run start:dev` from `apps/backend`), watch for `Nest can't resolve dependencies` or circular-dependency errors in the startup log, then stop it (Ctrl+C) — this is a manual smoke check, not an automated step, but catches DI wiring mistakes `tsc`/Jest can't.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payos/payos.module.ts apps/backend/src/app.module.ts
git commit -m "feat: wire PeriodCharge + renewal crons into PayosModule, register ScheduleModule"
```

---

### Task 16: e2e test — full renewal + non-renewal downgrade flow

**Files:**
- Create: `apps/backend/test/period-charge-renewal.e2e-spec.ts`

**Interfaces:**
- Consumes: everything above, via real HTTP requests + direct cron-service invocation against a real Postgres (testcontainers), mirroring `payos-plan-upgrade.e2e-spec.ts`'s structure exactly (same `PostgreSqlContainer` setup, same `fakeAdapter` override for `PAYOS_PAYMENT_ADAPTER`, same webhook-signing helper).

- [ ] **Step 1: Write the e2e test**

```typescript
// apps/backend/test/period-charge-renewal.e2e-spec.ts
import { createHmac } from 'node:crypto';
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SubscriptionOrmEntity } from '../src/modules/billing/infrastructure/subscription.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { NonRenewalDowngradeScannerService } from '../src/modules/payos/application/non-renewal-downgrade-scanner.service';
import { RenewalReminderScannerService } from '../src/modules/payos/application/renewal-reminder-scanner.service';
import type { IPayosPaymentAdapter } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PAYOS_PAYMENT_ADAPTER } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PeriodChargeOrmEntity } from '../src/modules/payos/infrastructure/period-charge.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

const CHECKSUM_KEY = 'e2e-payos-checksum-key';

function signWebhookData(data: Record<string, unknown>): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&');
  return createHmac('sha256', CHECKSUM_KEY).update(query).digest('hex');
}

const fakeAdapter: IPayosPaymentAdapter = {
  createPaymentLink: async (input) => ({
    checkoutUrl: `https://pay.payos.vn/${input.orderCode}`,
    orderCode: input.orderCode,
  }),
};

describe('Renewal & non-renewal downgrade (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let reminderScanner: RenewalReminderScannerService;
  let downgradeScanner: NonRenewalDowngradeScannerService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';
    process.env.PAYOS_CLIENT_ID = 'e2e-payos-client';
    process.env.PAYOS_API_KEY = 'e2e-payos-key';
    process.env.PAYOS_CHECKSUM_KEY = CHECKSUM_KEY;
    process.env.PAYOS_RETURN_URL_ALLOWLIST = 'https://app.casso.vn';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .overrideProvider(PAYOS_PAYMENT_ADAPTER)
      .useValue(fakeAdapter)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    reminderScanner = moduleRef.get(RenewalReminderScannerService);
    downgradeScanner = moduleRef.get(NonRenewalDowngradeScannerService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  }, 60_000);

  async function setUpOrgWithStarterSubscription(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const userId = organizationId.replace('00000000-0000', '33333333-3333');
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Renewal Test Owner',
      email: `renewal-test-${organizationId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: organizationId.replace('00000000-0000', '44444444-4444'),
      organizationId,
      planId: PlanId.STARTER,
      receivableMonthlyLimit: 500,
      bankConnectionLimit: 2,
      copilotChatMonthlyLimit: 100,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      createdAt: periodStart,
    });
  }

  it('reminder scanner creates a PeriodCharge and a webhook confirms it as renewal', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000601';
    const now = new Date('2026-08-28T00:00:00Z');
    const periodEnd = new Date('2026-08-31T00:00:00Z'); // 3 days from `now`
    await setUpOrgWithStarterSubscription(
      organizationId,
      new Date('2026-08-01T00:00:00Z'),
      periodEnd,
    );

    await reminderScanner.scan(now);

    const charge = await dataSource
      .getRepository(PeriodChargeOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(charge.status).toBe('PENDING');
    const orderCode = Number(charge.orderCode) + 100_000_000;

    const webhookData = {
      orderCode,
      amount: 299000,
      description: 'Gia han goi STARTER',
      code: '00',
      desc: 'success',
    };
    await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send({
        code: '00',
        desc: 'success',
        success: true,
        data: webhookData,
        signature: signWebhookData(webhookData),
      })
      .expect(200);

    const paidCharge = await dataSource
      .getRepository(PeriodChargeOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(paidCharge.status).toBe('PAID');

    // Subscription plan is unchanged by a renewal — only the charge status moved.
    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.STARTER);
  });

  it('downgrade scanner reverts an unpaid subscription to FREE after the grace window', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000602';
    const graceCutoff = new Date('2026-09-04T00:00:00Z');
    const periodEnd = new Date(graceCutoff.getTime() - 3 * 24 * 60 * 60 * 1000);
    const periodStart = new Date(
      periodEnd.getTime() - 31 * 24 * 60 * 60 * 1000,
    );
    await setUpOrgWithStarterSubscription(
      organizationId,
      periodStart,
      periodEnd,
    );

    await downgradeScanner.scan(graceCutoff);

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.FREE);
  });

  it('downgrade scanner leaves a PAID subscription alone', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000603';
    const graceCutoff = new Date('2026-09-04T00:00:00Z');
    const periodEnd = new Date(graceCutoff.getTime() - 3 * 24 * 60 * 60 * 1000);
    const periodStart = new Date(
      periodEnd.getTime() - 31 * 24 * 60 * 60 * 1000,
    );
    await setUpOrgWithStarterSubscription(
      organizationId,
      periodStart,
      periodEnd,
    );
    await dataSource.getRepository(PeriodChargeOrmEntity).save({
      organizationId,
      planId: PlanId.STARTER,
      periodStart,
      periodEnd,
      status: 'PAID',
      createdAt: periodStart,
      updatedAt: periodStart,
    });

    await downgradeScanner.scan(graceCutoff);

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.STARTER);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx jest --config ./test/jest-e2e.json --testPathPatterns "period-charge-renewal"` (from `apps/backend`)
Expected: PASS (3 tests) — if it fails, read the actual error (Postgres connection, DI wiring, webhook 401, etc.) before changing anything; do not guess.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/period-charge-renewal.e2e-spec.ts
git commit -m "test: e2e coverage for renewal reminder + non-renewal downgrade"
```

---

## Final Verification (run once all 16 tasks are committed)

- [ ] `npx tsc --noEmit` (from `apps/backend`) — clean
- [ ] `npx jest` (from `apps/backend`) — full unit suite green
- [ ] `npx jest --config ./test/jest-e2e.json` (from `apps/backend`) — full e2e suite green, including both the pre-existing `payos-plan-upgrade.e2e-spec.ts` (must still pass unchanged) and the new `period-charge-renewal.e2e-spec.ts`
- [ ] `npm run arch-check` (from `apps/backend`) — dependency-cruiser + Clean Architecture boundary scripts clean
- [ ] `npx biome check --write .` (from repo root) — clean
- [ ] Update `docs/wayfinder/feature-map.md` per `AGENTS.md`'s workflow (status → done, `Shipped:` date + PR reference, closes issue #153) — as a direct commit once the PR is open, matching how #151/#154/#156 were handled

## Explicitly Out of Scope (do not build these)

- **FE integration** — no billing-page UI changes for the renewal reminder banner or a manual "Gia hạn ngay" button; this plan is backend-only (mirrors #152/PR #156's scope split with #153's FE tracked separately if ever needed).
- **Retrying a failed `PeriodCharge` automatically** — if a payment fails, the org must wait for the next day's reminder-scan trigger (if still within the lead window) or manually call `POST /payos/period-charges` — no dedicated "retry" endpoint.
- **Configurable grace/lead days** — `RENEWAL_REMINDER_LEAD_DAYS`/`NON_RENEWAL_GRACE_DAYS` are hardcoded constants (3 each), not per-org or env-configurable. Revisit if a real need for per-plan or per-org grace periods shows up.
- **Reusing an existing PENDING `PeriodCharge`** instead of creating a new one — not applicable given decision #4 (single trigger day means at most one `PeriodCharge` per period is ever created by the cron); a manual `POST /payos/period-charges` call outside the cron's trigger day could still create a second PENDING row for the same period, which is harmless (paying either one satisfies `hasPaidCurrentPeriod`) but not deduplicated. Note this if it becomes a real support/confusion issue.
