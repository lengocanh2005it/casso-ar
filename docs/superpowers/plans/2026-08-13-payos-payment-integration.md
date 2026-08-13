# PayOS Payment Integration for Plan Changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org self-serve a plan upgrade by paying through PayOS — a payment-initiation endpoint creates a PayOS checkout link, and PayOS's webhook (once payment is confirmed) drives the existing `ChangeSubscriptionPlanUseCase` (from #150/PR #154), without duplicating plan-transition logic.

**Architecture:** New module `modules/payos/` (4-layer Clean Architecture) imports `BillingModule` to reach `ChangeSubscriptionPlanUseCase`/`SUBSCRIPTION_REPOSITORY`. A local `PlanUpgradeOrder` entity (UUID PK + a separate numeric `orderCode` column) is the only correlation between an org/target-plan and PayOS's numeric `orderCode` — PayOS has no metadata field. The webhook only ever confirms **success** in practice (`code: '00'`); no PayOS docs page found a worked example of a distinct failure webhook, so `ConfirmPlanUpgradeOrderUseCase` treats any non-`'00'` code defensively as a terminal failure, and reconciliation for orders that never receive any webhook is explicitly out of scope for this plan (see ponytail note in Task 11).

**Tech Stack:** NestJS 11, TypeORM 1.1, `@payos/node` v2.0.5 (official SDK, used only for `paymentRequests.create` — webhook signature verification is hand-rolled per Global Constraint below), `class-validator`, Jest 30 + testcontainers.

## Global Constraints

- Money: integers in VND, no float (`amount` fields are `number`, already integer VND per PayOS contract).
- Every write that changes an amount/status runs inside one DB transaction (`DataSource.transaction`).
- Every query/write scoped by `organizationId` (`TenantContextService.getOrganizationId()` where an authenticated request exists; the webhook has none, so `organizationId` comes from the looked-up `PlanUpgradeOrder` row instead).
- `application/` layer MUST NOT import `@payos/node` or throw NestJS exceptions — only `AppError`. `@payos/node` is imported only in `infrastructure/payos.adapter.ts`.
- Domain ↔ ORM translation via an explicit `toOrm()` mapper — never `as`/`as unknown as`.
- Webhook auth MUST use constant-time comparison (`crypto.timingSafeEqual`) — **not** `@payos/node`'s own `Webhooks.verify()`, which the vendor SDK implements with a plain `!==` (confirmed in `docs/superpowers/research/2026-08-13-payos-webhook-api-contract.md` §3).
- API prefix `/api/v1`. Error shape `{ statusCode, errorCode, message, details? }`.
- File naming: kebab-case files, `XOrmEntity` classes, `*.usecase.ts` / `*-repository.port.ts` / `*.port.ts`, DI tokens `Symbol('X')`.
- No migrations directory exists in this repo (dev/test run on `synchronize: true`; see `apps/backend/src/config/typeorm.config.ts`) — new entities are picked up automatically, no migration file needed.

---

## Task 1: Extract `equalsConstantTime` into a shared util

**Files:**
- Create: `apps/backend/src/common/security/constant-time-compare.ts`
- Create: `apps/backend/src/common/security/constant-time-compare.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`

**Interfaces:**
- Produces: `equalsConstantTime(actual: string, expected: string): boolean` — exported function, used by both the existing CASSO guard and the new PayOS guard (Task 10).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/common/security/constant-time-compare.spec.ts
import { equalsConstantTime } from './constant-time-compare';

describe('equalsConstantTime', () => {
  it('returns true for identical strings', () => {
    expect(equalsConstantTime('secret-123', 'secret-123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(equalsConstantTime('secret-123', 'secret-456')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(equalsConstantTime('short', 'a-much-longer-string')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern constant-time-compare -v`
Expected: FAIL — `Cannot find module './constant-time-compare'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/common/security/constant-time-compare.ts
import { timingSafeEqual } from 'node:crypto';

export function equalsConstantTime(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern constant-time-compare -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `WebhookAuthGuard` to use the shared util**

```typescript
// apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { equalsConstantTime } from '../../../common/security/constant-time-compare';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const headers = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers;
    const clientId = headers['x-client-id'];
    const secretKey = headers['x-secret-key'];
    const expectedClientId = process.env.CASSO_WEBHOOK_CLIENT_ID;
    const expectedSecretKey = process.env.CASSO_WEBHOOK_SECRET_KEY;
    if (!expectedClientId || !expectedSecretKey) {
      throw new UnauthorizedException('Webhook credentials not configured');
    }
    if (
      typeof clientId !== 'string' ||
      typeof secretKey !== 'string' ||
      !equalsConstantTime(clientId, expectedClientId) ||
      !equalsConstantTime(secretKey, expectedSecretKey)
    )
      throw new UnauthorizedException('Invalid webhook credentials');
    return true;
  }
}
```

- [ ] **Step 6: Run the existing CASSO guard test suite to confirm no regression**

Run: `npx jest --testPathPattern webhook-auth.guard -v`
Expected: PASS (all 6 existing tests, unchanged assertions)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/common/security/constant-time-compare.ts apps/backend/src/common/security/constant-time-compare.spec.ts apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts
git commit -m "refactor: extract equalsConstantTime into shared common/security util"
```

---

## Task 2: Add PayOS env vars and the `@payos/node` dependency

**Files:**
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/package.json`

**Interfaces:**
- Produces: `process.env.PAYOS_CLIENT_ID`, `process.env.PAYOS_API_KEY`, `process.env.PAYOS_CHECKSUM_KEY`, `process.env.PAYOS_RETURN_URL_ALLOWLIST` — consumed by Task 6 (allowlist) and Task 7 (adapter)/Task 10 (webhook guard).

- [ ] **Step 1: Add env vars to `.env.example`**

```bash
# apps/backend/.env.example (append)
PAYOS_CLIENT_ID=dev-payos-client-id
PAYOS_API_KEY=dev-payos-api-key
PAYOS_CHECKSUM_KEY=change-me
PAYOS_RETURN_URL_ALLOWLIST=http://localhost:5173
```

- [ ] **Step 2: Install `@payos/node`**

Run: `pnpm --filter @casso-ledger/backend add @payos/node@^2.0.5`

- [ ] **Step 3: Verify install**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS, no new type errors — confirms the package resolved and its types are usable.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/.env.example apps/backend/package.json pnpm-lock.yaml
git commit -m "chore: add PayOS env vars and @payos/node dependency"
```

---

## Task 3: `PlanUpgradeOrderStatus` enum + `PlanUpgradeOrder` domain entity

**Files:**
- Create: `packages/shared-types/src/plan-upgrade-order-status.ts`
- Modify: `packages/shared-types/src/index.ts`
- Create: `apps/backend/src/modules/payos/domain/plan-upgrade-order.ts`
- Create: `apps/backend/src/modules/payos/domain/plan-upgrade-order.spec.ts`

**Interfaces:**
- Produces: `PlanUpgradeOrderStatus` enum (`PENDING | PAID | FAILED`), `PlanUpgradeOrder` class with `id`, `orderCode: number`, `organizationId`, `targetPlanId: PlanId`, `status`, `createdAt`, `updatedAt`; methods `markPaid(): PlanUpgradeOrder`, `markFailed(): PlanUpgradeOrder`, `isTerminal(): boolean`.
- Consumes: `PlanId` from `@casso-ledger/shared-types` (already exists).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/domain/plan-upgrade-order.spec.ts
import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { PlanUpgradeOrder } from './plan-upgrade-order';

function buildOrder(status = PlanUpgradeOrderStatus.PENDING): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: 'order-1',
    orderCode: 1001,
    organizationId: 'org-1',
    targetPlanId: PlanId.STARTER,
    status,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    updatedAt: new Date('2026-08-13T00:00:00Z'),
  });
}

describe('PlanUpgradeOrder', () => {
  it('markPaid() returns a new PAID instance and preserves other fields', () => {
    const order = buildOrder();
    const paid = order.markPaid();
    expect(paid.status).toBe(PlanUpgradeOrderStatus.PAID);
    expect(paid.id).toBe(order.id);
    expect(paid.orderCode).toBe(order.orderCode);
    expect(order.status).toBe(PlanUpgradeOrderStatus.PENDING);
  });

  it('markFailed() returns a new FAILED instance', () => {
    const failed = buildOrder().markFailed();
    expect(failed.status).toBe(PlanUpgradeOrderStatus.FAILED);
  });

  it('isTerminal() is false for PENDING and true for PAID/FAILED', () => {
    expect(buildOrder(PlanUpgradeOrderStatus.PENDING).isTerminal()).toBe(false);
    expect(buildOrder(PlanUpgradeOrderStatus.PAID).isTerminal()).toBe(true);
    expect(buildOrder(PlanUpgradeOrderStatus.FAILED).isTerminal()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern plan-upgrade-order.spec -v`
Expected: FAIL — `Cannot find module './plan-upgrade-order'` (and `PlanUpgradeOrderStatus` not exported yet)

- [ ] **Step 3: Add the enum to shared-types**

```typescript
// packages/shared-types/src/plan-upgrade-order-status.ts
export enum PlanUpgradeOrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}
```

```typescript
// packages/shared-types/src/index.ts (add this line, keep alphabetical order)
export { PlanUpgradeOrderStatus } from './plan-upgrade-order-status';
```

- [ ] **Step 4: Write the domain entity**

```typescript
// apps/backend/src/modules/payos/domain/plan-upgrade-order.ts
import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';

export interface PlanUpgradeOrderProps {
  id: string;
  orderCode: number;
  organizationId: string;
  targetPlanId: PlanId;
  status: PlanUpgradeOrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PlanUpgradeOrder {
  readonly id: string;
  readonly orderCode: number;
  readonly organizationId: string;
  readonly targetPlanId: PlanId;
  readonly status: PlanUpgradeOrderStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PlanUpgradeOrderProps) {
    this.id = props.id;
    this.orderCode = props.orderCode;
    this.organizationId = props.organizationId;
    this.targetPlanId = props.targetPlanId;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  markPaid(): PlanUpgradeOrder {
    return new PlanUpgradeOrder({
      ...this,
      status: PlanUpgradeOrderStatus.PAID,
      updatedAt: new Date(),
    });
  }

  markFailed(): PlanUpgradeOrder {
    return new PlanUpgradeOrder({
      ...this,
      status: PlanUpgradeOrderStatus.FAILED,
      updatedAt: new Date(),
    });
  }

  isTerminal(): boolean {
    return this.status !== PlanUpgradeOrderStatus.PENDING;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern plan-upgrade-order.spec -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/plan-upgrade-order-status.ts packages/shared-types/src/index.ts apps/backend/src/modules/payos/domain/plan-upgrade-order.ts apps/backend/src/modules/payos/domain/plan-upgrade-order.spec.ts
git commit -m "feat: PlanUpgradeOrder domain entity"
```

---

## Task 4: `PlanUpgradeOrder` ORM entity + repository port + TypeORM repository

**Files:**
- Create: `apps/backend/src/modules/payos/infrastructure/plan-upgrade-order.orm-entity.ts`
- Create: `apps/backend/src/modules/payos/application/plan-upgrade-order-repository.port.ts`
- Create: `apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.ts`
- Create: `apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.spec.ts`

**Interfaces:**
- Consumes: `PlanUpgradeOrder` (Task 3), `BaseRepository` (`common/tenancy/base.repository.ts`, existing).
- Produces: `IPlanUpgradeOrderRepository` with `create(order, manager?): Promise<void>`, `lockAndFindByOrderCode(orderCode: number, manager: EntityManager): Promise<PlanUpgradeOrder | null>`, `save(order, manager?): Promise<void>` — consumed by Task 8 (`InitiatePlanUpgradeOrderUseCase`) and Task 11 (`ConfirmPlanUpgradeOrderUseCase`). DI token `PLAN_UPGRADE_ORDER_REPOSITORY`.

- [ ] **Step 1: Write the failing test** (repository behavior, using an in-memory fake `EntityManager`-free path is impractical for TypeORM — this repo tests TypeORM repositories only at the e2e level per existing convention; `TypeOrmSubscriptionRepository` has no unit spec either. Skip a unit test here and rely on Task 14's e2e coverage — **stated exception per AGENTS.md testing exceptions: this is thin infrastructure wrapping generated TypeORM queries, exercised end-to-end in Task 14.**)

- [ ] **Step 2: Write the ORM entity**

```typescript
// apps/backend/src/modules/payos/infrastructure/plan-upgrade-order.orm-entity.ts
import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import {
  Column,
  Entity,
  Generated,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'plan_upgrade_orders' })
@Index(['orderCode'], { unique: true })
export class PlanUpgradeOrderOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('bigint')
  @Generated('increment')
  orderCode: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: PlanId })
  targetPlanId: PlanId;

  @Column({ type: 'enum', enum: PlanUpgradeOrderStatus })
  status: PlanUpgradeOrderStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 3: Write the repository port**

`create()` returns the full `PlanUpgradeOrder` (not `void`) because `id`/`orderCode` are DB-generated — the caller (Task 8) needs the generated `orderCode` to pass to PayOS.

```typescript
// apps/backend/src/modules/payos/application/plan-upgrade-order-repository.port.ts
import type { PlanId } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import type { PlanUpgradeOrder } from '../domain/plan-upgrade-order';

export interface CreatePlanUpgradeOrderInput {
  organizationId: string;
  targetPlanId: PlanId;
}

export interface IPlanUpgradeOrderRepository {
  create(input: CreatePlanUpgradeOrderInput): Promise<PlanUpgradeOrder>;
  lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PlanUpgradeOrder | null>;
  save(order: PlanUpgradeOrder, manager?: EntityManager): Promise<void>;
}

export const PLAN_UPGRADE_ORDER_REPOSITORY = Symbol(
  'PLAN_UPGRADE_ORDER_REPOSITORY',
);
```

- [ ] **Step 4: Write the TypeORM repository**

```typescript
// apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.ts
import { PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type {
  CreatePlanUpgradeOrderInput,
  IPlanUpgradeOrderRepository,
} from '../application/plan-upgrade-order-repository.port';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import { PlanUpgradeOrderOrmEntity } from './plan-upgrade-order.orm-entity';

function toDomain(row: PlanUpgradeOrderOrmEntity): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: row.id,
    orderCode: Number(row.orderCode),
    organizationId: row.organizationId,
    targetPlanId: row.targetPlanId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toOrm(
  order: PlanUpgradeOrder,
): Omit<PlanUpgradeOrderOrmEntity, 'orderCode'> & { orderCode: string } {
  return {
    id: order.id,
    orderCode: String(order.orderCode),
    organizationId: order.organizationId,
    targetPlanId: order.targetPlanId,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

@Injectable()
export class TypeOrmPlanUpgradeOrderRepository
  implements IPlanUpgradeOrderRepository
{
  constructor(
    @InjectRepository(PlanUpgradeOrderOrmEntity)
    private readonly ormRepo: Repository<PlanUpgradeOrderOrmEntity>,
  ) {}

  async create(
    input: CreatePlanUpgradeOrderInput,
  ): Promise<PlanUpgradeOrder> {
    const now = new Date();
    const saved = await this.ormRepo.save({
      organizationId: input.organizationId,
      targetPlanId: input.targetPlanId,
      status: PlanUpgradeOrderStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
    return toDomain(saved);
  }

  async lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PlanUpgradeOrder | null> {
    const row = await manager
      .getRepository(PlanUpgradeOrderOrmEntity)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.orderCode = :orderCode', { orderCode: String(orderCode) })
      .getOne();
    return row ? toDomain(row) : null;
  }

  async save(order: PlanUpgradeOrder, manager?: EntityManager): Promise<void> {
    const repo = manager
      ? manager.getRepository(PlanUpgradeOrderOrmEntity)
      : this.ormRepo;
    await repo.save(toOrm(order));
  }
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payos/infrastructure/plan-upgrade-order.orm-entity.ts apps/backend/src/modules/payos/application/plan-upgrade-order-repository.port.ts apps/backend/src/modules/payos/infrastructure/typeorm-plan-upgrade-order.repository.ts
git commit -m "feat: PlanUpgradeOrder ORM entity and TypeORM repository"
```

---

## Task 5: `PLAN_UPGRADE_ORDER_CREATE` audit entries

**Files:**
- Modify: `apps/backend/src/common/audit/audit.enums.ts`

**Interfaces:**
- Produces: `AuditActionType.PLAN_UPGRADE_ORDER_CREATE`, `AuditEntityType.PLAN_UPGRADE_ORDER` — consumed by Task 9's controller and Task 11's manual audit write.

- [ ] **Step 1: No test needed** — this is a pure enum addition (configuration-only change, per AGENTS.md testing exceptions).

- [ ] **Step 2: Add the enum members**

```typescript
// apps/backend/src/common/audit/audit.enums.ts
// Add to AuditActionType, after SUBSCRIPTION_CHANGE_PLAN:
  PLAN_UPGRADE_ORDER_CREATE = 'PLAN_UPGRADE_ORDER_CREATE',

// Add to AuditEntityType, after SUBSCRIPTION:
  PLAN_UPGRADE_ORDER = 'PlanUpgradeOrder',
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/common/audit/audit.enums.ts
git commit -m "feat: add PLAN_UPGRADE_ORDER_CREATE audit action type"
```

---

## Task 6: `returnUrl`/`cancelUrl` allowlist validator

**Files:**
- Create: `apps/backend/src/modules/payos/application/validate-payos-redirect-uri.ts`
- Create: `apps/backend/src/modules/payos/application/validate-payos-redirect-uri.spec.ts`

**Interfaces:**
- Produces: `parsePayosRedirectUriAllowlist(value: string | undefined): string[]`, `isPayosRedirectUriAllowed(uri: string, allowlist: readonly string[]): boolean` — consumed by Task 9's DTO validator.

This mirrors the existing `modules/bank-connections/application/validate-cas-redirect-uri.ts` pattern exactly (same origin-allowlist logic), kept as a separate small file per-module rather than imported cross-module, since `application/` layers don't reach into other modules' internals directly.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/validate-payos-redirect-uri.spec.ts
import {
  isPayosRedirectUriAllowed,
  parsePayosRedirectUriAllowlist,
} from './validate-payos-redirect-uri';

describe('parsePayosRedirectUriAllowlist', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(
      parsePayosRedirectUriAllowlist('https://a.com, https://b.com'),
    ).toEqual(['https://a.com', 'https://b.com']);
  });

  it('returns an empty array for undefined', () => {
    expect(parsePayosRedirectUriAllowlist(undefined)).toEqual([]);
  });
});

describe('isPayosRedirectUriAllowed', () => {
  it('allows any URI when the allowlist is empty', () => {
    expect(isPayosRedirectUriAllowed('https://anything.com/x', [])).toBe(true);
  });

  it('allows a URI whose origin matches an allowlisted origin', () => {
    expect(
      isPayosRedirectUriAllowed('https://app.casso.vn/billing?x=1', [
        'https://app.casso.vn',
      ]),
    ).toBe(true);
  });

  it('rejects a URI whose origin is not in the allowlist', () => {
    expect(
      isPayosRedirectUriAllowed('https://evil.com/phish', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('rejects an unparseable URI', () => {
    expect(isPayosRedirectUriAllowed('not-a-url', ['https://app.casso.vn'])).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern validate-payos-redirect-uri -v`
Expected: FAIL — `Cannot find module './validate-payos-redirect-uri'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/validate-payos-redirect-uri.ts
function originOf(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function parsePayosRedirectUriAllowlist(
  value: string | undefined,
): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isPayosRedirectUriAllowed(
  redirectUri: string,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) return true;
  const redirectOrigin = originOf(redirectUri);
  return (
    redirectOrigin !== null &&
    allowlist.some((allowedOrigin) => originOf(allowedOrigin) === redirectOrigin)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern validate-payos-redirect-uri -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/application/validate-payos-redirect-uri.ts apps/backend/src/modules/payos/application/validate-payos-redirect-uri.spec.ts
git commit -m "feat: PayOS return/cancel URL allowlist validator"
```

---

## Task 7: `IPayosPaymentAdapter` port + `PayosAdapter` infrastructure

**Files:**
- Create: `apps/backend/src/modules/payos/application/payos-payment-adapter.port.ts`
- Create: `apps/backend/src/modules/payos/infrastructure/payos.adapter.ts`

**Interfaces:**
- Produces: `IPayosPaymentAdapter.createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>` — consumed by Task 8. DI token `PAYOS_PAYMENT_ADAPTER`.

No unit test for `PayosAdapter` itself (it is a thin wrapper with no branching logic beyond passing fields through to the SDK) — **stated TDD exception**: this is exercised via Task 8's use case test, which mocks `IPayosPaymentAdapter` directly (the port, not the SDK), and via a fake adapter substituted in Task 14's e2e test (no real network call to PayOS in tests).

- [ ] **Step 1: Write the port**

```typescript
// apps/backend/src/modules/payos/application/payos-payment-adapter.port.ts
export interface CreatePaymentLinkInput {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePaymentLinkResult {
  checkoutUrl: string;
  orderCode: number;
}

export interface IPayosPaymentAdapter {
  createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult>;
}

export const PAYOS_PAYMENT_ADAPTER = Symbol('PAYOS_PAYMENT_ADAPTER');
```

- [ ] **Step 2: Write the adapter**

```typescript
// apps/backend/src/modules/payos/infrastructure/payos.adapter.ts
import { PayOS } from '@payos/node';
import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  IPayosPaymentAdapter,
} from '../application/payos-payment-adapter.port';

@Injectable()
export class PayosAdapter implements IPayosPaymentAdapter {
  private readonly client: PayOS;

  constructor() {
    this.client = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID ?? '',
      apiKey: process.env.PAYOS_API_KEY ?? '',
      checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
    });
  }

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    const link = await this.client.paymentRequests.create({
      orderCode: input.orderCode,
      amount: input.amount,
      description: input.description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });
    return { checkoutUrl: link.checkoutUrl, orderCode: link.orderCode };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS — confirms `@payos/node`'s exported `PayOS` class and `paymentRequests.create` signature match this usage (per `@payos/node` v2.0.5 README).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/payos/application/payos-payment-adapter.port.ts apps/backend/src/modules/payos/infrastructure/payos.adapter.ts
git commit -m "feat: PayOS payment adapter wrapping @payos/node"
```

---

## Task 8: `InitiatePlanUpgradeOrderUseCase`

**Files:**
- Create: `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts`
- Create: `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPlanUpgradeOrderRepository` (Task 4), `IPayosPaymentAdapter` (Task 7), `ISubscriptionRepository` (existing, `modules/billing/application/subscription-repository.port.ts`).
- Produces: `InitiatePlanUpgradeOrderUseCase.execute(input: { organizationId: string; targetPlanId: PlanId; returnUrl: string; cancelUrl: string }): Promise<{ checkoutUrl: string }>` — consumed by Task 9's controller.

Tier price table: since #150/#154 does not expose a price field on `PLAN_CATALOG` (it only has `tier`, limits, `canUseCustomSmtp`), and PayOS requires a VND `amount`, this use case needs a price. **Decision, following the existing `PLAN_CATALOG` pattern in `modules/billing/domain/subscription.ts`:** add a local, private `PLAN_PRICE_VND: Record<PlanId, number>` constant in this use case file — it is PayOS-specific pricing data, not a `Subscription` domain concern, so it does not belong in `billing/domain/subscription.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts
import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { Subscription } from '../../billing/domain/subscription';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import type { IPayosPaymentAdapter } from './payos-payment-adapter.port';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';
import { InitiatePlanUpgradeOrderUseCase } from './initiate-plan-upgrade-order.usecase';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';

describe('InitiatePlanUpgradeOrderUseCase', () => {
  function buildDeps() {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-01T00:00:00Z'),
    );
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findByOrganizationId: jest.fn().mockResolvedValue(subscription),
      lockAndFindByOrganizationId: jest.fn(),
      countReceivablesInPeriod: jest.fn(),
      countCopilotChatTurnsInPeriod: jest.fn(),
      save: jest.fn(),
    };
    const orderRepo: jest.Mocked<IPlanUpgradeOrderRepository> = {
      create: jest.fn().mockResolvedValue(
        new PlanUpgradeOrder({
          id: 'order-1',
          orderCode: 1001,
          organizationId: 'org-1',
          targetPlanId: PlanId.STARTER,
          status: PlanUpgradeOrderStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      lockAndFindByOrderCode: jest.fn(),
      save: jest.fn(),
    };
    const adapter: jest.Mocked<IPayosPaymentAdapter> = {
      createPaymentLink: jest
        .fn()
        .mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/x', orderCode: 1001 }),
    };
    const useCase = new InitiatePlanUpgradeOrderUseCase(
      orderRepo,
      subscriptionRepo,
      adapter,
    );
    return { useCase, subscriptionRepo, orderRepo, adapter };
  }

  it('creates an order and returns the PayOS checkout URL for a valid upgrade', async () => {
    const { useCase, orderRepo, adapter } = buildDeps();
    const result = await useCase.execute({
      organizationId: 'org-1',
      targetPlanId: PlanId.STARTER,
      returnUrl: 'https://app.casso.vn/billing?status=success',
      cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
    });

    expect(result.checkoutUrl).toBe('https://pay.payos.vn/x');
    expect(orderRepo.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      targetPlanId: PlanId.STARTER,
    });
    expect(adapter.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ orderCode: 1001, amount: 299000 }),
    );
  });

  it('throws INVALID_PLAN_TRANSITION for a same-or-lower tier target without creating an order', async () => {
    const { useCase, orderRepo, adapter } = buildDeps();
    await expect(
      useCase.execute({
        organizationId: 'org-1',
        targetPlanId: PlanId.FREE,
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_PLAN_TRANSITION' });
    expect(orderRepo.create).not.toHaveBeenCalled();
    expect(adapter.createPaymentLink).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the organization has no subscription', async () => {
    const { useCase, subscriptionRepo } = buildDeps();
    subscriptionRepo.findByOrganizationId.mockResolvedValue(null);
    await expect(
      useCase.execute({
        organizationId: 'org-1',
        targetPlanId: PlanId.STARTER,
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern initiate-plan-upgrade-order.usecase -v`
Expected: FAIL — `Cannot find module './initiate-plan-upgrade-order.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { PlanId } from '@casso-ledger/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import {
  PAYOS_PAYMENT_ADAPTER,
  type IPayosPaymentAdapter,
} from './payos-payment-adapter.port';
import {
  PLAN_UPGRADE_ORDER_REPOSITORY,
  type IPlanUpgradeOrderRepository,
} from './plan-upgrade-order-repository.port';

// PayOS-specific pricing — not a Subscription/billing domain concern, so it
// does not belong in modules/billing/domain/subscription.ts's PLAN_CATALOG.
const PLAN_TIER: Record<PlanId, number> = {
  [PlanId.FREE]: 0,
  [PlanId.STARTER]: 1,
  [PlanId.BUSINESS]: 2,
  [PlanId.ENTERPRISE]: 3,
};

const PLAN_PRICE_VND: Record<PlanId, number> = {
  [PlanId.FREE]: 0,
  [PlanId.STARTER]: 299_000,
  [PlanId.BUSINESS]: 999_000,
  [PlanId.ENTERPRISE]: 2_999_000,
};

export interface InitiatePlanUpgradeOrderInput {
  organizationId: string;
  targetPlanId: PlanId;
  returnUrl: string;
  cancelUrl: string;
}

export interface InitiatePlanUpgradeOrderResult {
  checkoutUrl: string;
}

@Injectable()
export class InitiatePlanUpgradeOrderUseCase {
  constructor(
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly orderRepo: IPlanUpgradeOrderRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(PAYOS_PAYMENT_ADAPTER)
    private readonly payosAdapter: IPayosPaymentAdapter,
  ) {}

  async execute(
    input: InitiatePlanUpgradeOrderInput,
  ): Promise<InitiatePlanUpgradeOrderResult> {
    const subscription = await this.subscriptionRepo.findByOrganizationId(
      input.organizationId,
    );
    if (!subscription) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy gói đăng ký của tổ chức.',
      );
    }
    if (PLAN_TIER[input.targetPlanId] <= PLAN_TIER[subscription.planId]) {
      throw new AppError(
        ErrorCode.INVALID_PLAN_TRANSITION,
        `Không thể nâng cấp sang gói ${input.targetPlanId} từ gói hiện tại.`,
      );
    }

    const order = await this.orderRepo.create({
      organizationId: input.organizationId,
      targetPlanId: input.targetPlanId,
    });

    const link = await this.payosAdapter.createPaymentLink({
      orderCode: order.orderCode,
      amount: PLAN_PRICE_VND[input.targetPlanId],
      description: `Nang cap goi ${input.targetPlanId}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    return { checkoutUrl: link.checkoutUrl };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern initiate-plan-upgrade-order.usecase -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts
git commit -m "feat: InitiatePlanUpgradeOrderUseCase"
```

---

## Task 9: Payment-initiation DTOs + controller endpoint

**Files:**
- Create: `apps/backend/src/modules/payos/presentation/dto/initiate-plan-upgrade-order.dto.ts`
- Create: `apps/backend/src/modules/payos/presentation/dto/plan-upgrade-order-response.dto.ts`
- Create: `apps/backend/src/modules/payos/presentation/payos.controller.ts`

**Interfaces:**
- Consumes: `InitiatePlanUpgradeOrderUseCase` (Task 8), `IdempotencyService` (existing, `common/idempotency/idempotency.service.ts`), `isPayosRedirectUriAllowed`/`parsePayosRedirectUriAllowlist` (Task 6), `AuditActionType.PLAN_UPGRADE_ORDER_CREATE` (Task 5).
- Produces: `POST /api/v1/payos/plan-upgrade-orders` → `{ checkoutUrl: string }`.

No unit test for this controller — it has no branching logic (delegates to the use case), matching the existing `BillingController`'s lack of a unit spec; covered by Task 14's e2e test.

- [ ] **Step 1: Write the DTOs**

```typescript
// apps/backend/src/modules/payos/presentation/dto/initiate-plan-upgrade-order.dto.ts
import { PlanId } from '@casso-ledger/shared-types';
import {
  IsEnum,
  IsUrl,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  isPayosRedirectUriAllowed,
  parsePayosRedirectUriAllowlist,
} from '../../application/validate-payos-redirect-uri';

function IsAllowedPayosRedirectUri(validationOptions?: ValidationOptions) {
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

export class InitiatePlanUpgradeOrderDto {
  @IsEnum(PlanId)
  targetPlanId: PlanId;

  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  returnUrl: string;

  @IsUrl({ require_tld: false })
  @IsAllowedPayosRedirectUri()
  cancelUrl: string;
}
```

```typescript
// apps/backend/src/modules/payos/presentation/dto/plan-upgrade-order-response.dto.ts
export interface PlanUpgradeOrderResponseDto {
  checkoutUrl: string;
}
```

- [ ] **Step 2: Write the controller**

```typescript
// apps/backend/src/modules/payos/presentation/payos.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { InitiatePlanUpgradeOrderDto } from './dto/initiate-plan-upgrade-order.dto';
import type { PlanUpgradeOrderResponseDto } from './dto/plan-upgrade-order-response.dto';

@Controller('payos')
@UseGuards(PermissionGuard)
export class PayosController {
  constructor(
    private readonly initiateUseCase: InitiatePlanUpgradeOrderUseCase,
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
      async () => {
        return this.initiateUseCase.execute({
          organizationId,
          targetPlanId: dto.targetPlanId,
          returnUrl: dto.returnUrl,
          cancelUrl: dto.cancelUrl,
        });
      },
    );
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/payos/presentation/dto/initiate-plan-upgrade-order.dto.ts apps/backend/src/modules/payos/presentation/dto/plan-upgrade-order-response.dto.ts apps/backend/src/modules/payos/presentation/payos.controller.ts
git commit -m "feat: payment-initiation endpoint POST /payos/plan-upgrade-orders"
```

---

## Task 10: `PayosWebhookAuthGuard` + webhook DTO

**Files:**
- Create: `apps/backend/src/modules/payos/presentation/payos-webhook-auth.guard.ts`
- Create: `apps/backend/src/modules/payos/presentation/payos-webhook-auth.guard.spec.ts`
- Create: `apps/backend/src/modules/payos/presentation/dto/payos-webhook.dto.ts`

**Interfaces:**
- Consumes: `equalsConstantTime` (Task 1).
- Produces: `PayosWebhookAuthGuard` (NestJS `CanActivate`, throws `UnauthorizedException` on bad/missing signature) — consumed by Task 12's controller.

Per the research file §3, the signature covers the `data` object's keys sorted alphabetically, joined as `key=value&...`, HMAC-SHA256'd with `PAYOS_CHECKSUM_KEY`, and compared against the top-level `signature` field in the JSON body (not a header).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/presentation/payos-webhook-auth.guard.spec.ts
import { createHmac } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PayosWebhookAuthGuard } from './payos-webhook-auth.guard';

function signData(data: Record<string, unknown>, checksumKey: string): string {
  const sorted = Object.keys(data).sort();
  const query = sorted
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&');
  return createHmac('sha256', checksumKey).update(query).digest('hex');
}

function fakeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('PayosWebhookAuthGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws if PAYOS_CHECKSUM_KEY is missing', () => {
    delete process.env.PAYOS_CHECKSUM_KEY;
    const guard = new PayosWebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ data: { orderCode: 1 }, signature: 'x' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('passes when the signature matches the sorted-key HMAC of data', () => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
    const data = { orderCode: 1001, amount: 299000, code: '00' };
    const signature = signData(data, 'test-checksum-key');
    const guard = new PayosWebhookAuthGuard();
    expect(guard.canActivate(fakeContext({ data, signature }))).toBe(true);
  });

  it('rejects a tampered payload whose signature no longer matches', () => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
    const data = { orderCode: 1001, amount: 299000, code: '00' };
    const signature = signData(data, 'test-checksum-key');
    const guard = new PayosWebhookAuthGuard();
    expect(() =>
      guard.canActivate(
        fakeContext({ data: { ...data, amount: 1 }, signature }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing signature field', () => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
    const guard = new PayosWebhookAuthGuard();
    expect(() =>
      guard.canActivate(fakeContext({ data: { orderCode: 1 } })),
    ).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern payos-webhook-auth.guard -v`
Expected: FAIL — `Cannot find module './payos-webhook-auth.guard'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/presentation/payos-webhook-auth.guard.ts
import { createHmac } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { equalsConstantTime } from '../../../common/security/constant-time-compare';

function buildSignedQueryString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key] ?? ''}`)
    .join('&');
}

@Injectable()
export class PayosWebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
    if (!checksumKey) {
      throw new UnauthorizedException('PayOS checksum key not configured');
    }

    const body = context.switchToHttp().getRequest<{
      body: { data?: Record<string, unknown>; signature?: string };
    }>().body;

    if (!body?.data || typeof body.signature !== 'string') {
      throw new UnauthorizedException('Invalid webhook payload');
    }

    const expectedSignature = createHmac('sha256', checksumKey)
      .update(buildSignedQueryString(body.data))
      .digest('hex');

    if (!equalsConstantTime(body.signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern payos-webhook-auth.guard -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the webhook DTO**

```typescript
// apps/backend/src/modules/payos/presentation/dto/payos-webhook.dto.ts
export class PayosWebhookDataDto {
  orderCode: number;
  amount: number;
  description: string;
  code: string;
  desc: string;
  reference?: string;
}

export class PayosWebhookDto {
  code: string;
  desc: string;
  success: boolean;
  data: PayosWebhookDataDto;
  signature: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payos/presentation/payos-webhook-auth.guard.ts apps/backend/src/modules/payos/presentation/payos-webhook-auth.guard.spec.ts apps/backend/src/modules/payos/presentation/dto/payos-webhook.dto.ts
git commit -m "feat: PayosWebhookAuthGuard with constant-time signature verification"
```

---

## Task 11: `ConfirmPlanUpgradeOrderUseCase`

**Files:**
- Create: `apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.ts`
- Create: `apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPlanUpgradeOrderRepository` (Task 4), `ChangeSubscriptionPlanUseCase` (existing, `modules/billing/application/change-subscription-plan.usecase.ts`), `IAuditLogRepository` (existing, `common/audit/audit-log-repository.port.ts`).
- Produces: `ConfirmPlanUpgradeOrderUseCase.execute(input: { orderCode: number; paymentSucceeded: boolean }): Promise<void>` — consumed by Task 12's controller.

```
ponytail: no reconciliation/polling job for orders that never receive a
webhook (PayOS's webhook retry/backoff and whether FAILED/EXPIRED/CANCELLED
even fire a webhook are undocumented — see research file §"Open questions").
Upgrade path: add a scheduled job calling GET /v2/payment-requests/{orderCode}
for orders still PENDING after N minutes, once real traffic shows orders
getting stuck.
```

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.spec.ts
import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { DataSource } from 'typeorm';
import type { ChangeSubscriptionPlanUseCase } from '../../billing/application/change-subscription-plan.usecase';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';
import { ConfirmPlanUpgradeOrderUseCase } from './confirm-plan-upgrade-order.usecase';

function buildOrder(status = PlanUpgradeOrderStatus.PENDING): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: 'order-1',
    orderCode: 1001,
    organizationId: 'org-1',
    targetPlanId: PlanId.STARTER,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ConfirmPlanUpgradeOrderUseCase', () => {
  function buildDeps(existingOrder: PlanUpgradeOrder | null) {
    const orderRepo: jest.Mocked<IPlanUpgradeOrderRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn().mockResolvedValue(existingOrder),
      save: jest.fn(),
    };
    const changePlanUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ChangeSubscriptionPlanUseCase>;
    const auditLogRepo: jest.Mocked<IAuditLogRepository> = {
      create: jest.fn(),
      findPage: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
    } as unknown as DataSource;
    const useCase = new ConfirmPlanUpgradeOrderUseCase(
      orderRepo,
      changePlanUseCase,
      auditLogRepo,
      dataSource,
    );
    return { useCase, orderRepo, changePlanUseCase, auditLogRepo };
  }

  it('on success, calls ChangeSubscriptionPlanUseCase, marks the order PAID, and writes an audit log', async () => {
    const { useCase, orderRepo, changePlanUseCase, auditLogRepo } = buildDeps(
      buildOrder(),
    );
    await useCase.execute({ orderCode: 1001, paymentSucceeded: true });

    expect(changePlanUseCase.execute).toHaveBeenCalledWith('org-1', PlanId.STARTER);
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PlanUpgradeOrderStatus.PAID }),
      expect.anything(),
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'system' }),
      expect.anything(),
    );
  });

  it('on failure code, marks the order FAILED without calling ChangeSubscriptionPlanUseCase', async () => {
    const { useCase, orderRepo, changePlanUseCase } = buildDeps(buildOrder());
    await useCase.execute({ orderCode: 1001, paymentSucceeded: false });

    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PlanUpgradeOrderStatus.FAILED }),
      expect.anything(),
    );
  });

  it('is idempotent: a webhook replay for an already-terminal order is a no-op', async () => {
    const { useCase, orderRepo, changePlanUseCase } = buildDeps(
      buildOrder(PlanUpgradeOrderStatus.PAID),
    );
    await useCase.execute({ orderCode: 1001, paymentSucceeded: true });

    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op (does not throw) when orderCode is unknown', async () => {
    const { useCase, changePlanUseCase } = buildDeps(null);
    await expect(
      useCase.execute({ orderCode: 999999, paymentSucceeded: true }),
    ).resolves.toBeUndefined();
    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern confirm-plan-upgrade-order.usecase -v`
Expected: FAIL — `Cannot find module './confirm-plan-upgrade-order.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.ts
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
import { ChangeSubscriptionPlanUseCase } from '../../billing/application/change-subscription-plan.usecase';
import {
  PLAN_UPGRADE_ORDER_REPOSITORY,
  type IPlanUpgradeOrderRepository,
} from './plan-upgrade-order-repository.port';

export interface ConfirmPlanUpgradeOrderInput {
  orderCode: number;
  paymentSucceeded: boolean;
}

@Injectable()
export class ConfirmPlanUpgradeOrderUseCase {
  constructor(
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly orderRepo: IPlanUpgradeOrderRepository,
    private readonly changePlanUseCase: ChangeSubscriptionPlanUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ConfirmPlanUpgradeOrderInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await this.orderRepo.lockAndFindByOrderCode(
        input.orderCode,
        manager,
      );
      // Unknown orderCode or an already-terminal order (replayed webhook):
      // no-op, so the caller can still ack with 2xx.
      if (!order || order.isTerminal()) return;

      if (!input.paymentSucceeded) {
        await this.orderRepo.save(order.markFailed(), manager);
        return;
      }

      await this.changePlanUseCase.execute(
        order.organizationId,
        order.targetPlanId,
      );
      const paidOrder = order.markPaid();
      await this.orderRepo.save(paidOrder, manager);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: order.organizationId,
          userId: 'system',
          actionType: AuditActionType.SUBSCRIPTION_CHANGE_PLAN,
          entityType: AuditEntityType.SUBSCRIPTION,
          entityId: order.organizationId,
          beforeState: null,
          afterState: { planId: order.targetPlanId, orderCode: order.orderCode },
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

Run: `npx jest --testPathPattern confirm-plan-upgrade-order.usecase -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.ts apps/backend/src/modules/payos/application/confirm-plan-upgrade-order.usecase.spec.ts
git commit -m "feat: ConfirmPlanUpgradeOrderUseCase (webhook-driven plan change)"
```

---

## Task 12: Webhook controller endpoint

**Files:**
- Modify: `apps/backend/src/modules/payos/presentation/payos.controller.ts`

**Interfaces:**
- Consumes: `ConfirmPlanUpgradeOrderUseCase` (Task 11), `PayosWebhookAuthGuard` (Task 10), `PayosWebhookDto` (Task 10), `WebhookRateLimitGuard` (existing, `modules/webhooks/presentation/webhook-rate-limit.guard.ts`), `Public` decorator (existing, `common/auth/public.decorator.ts`).
- Produces: `POST /api/v1/payos/webhook` → `200 OK` always (per the "unknown orderCode → 200 + no-op" and "any code the request reached the handler with was already signature-verified" decisions from grilling).

- [ ] **Step 1: No new unit test** — the endpoint has no branching logic of its own (delegates entirely to `ConfirmPlanUpgradeOrderUseCase`, already covered by Task 11's unit tests); covered end-to-end by Task 14.

- [ ] **Step 2: Extend the controller**

```typescript
// apps/backend/src/modules/payos/presentation/payos.controller.ts (add to the existing PayosController)
import { HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import { WebhookRateLimitGuard } from '../../webhooks/presentation/webhook-rate-limit.guard';
import { ConfirmPlanUpgradeOrderUseCase } from '../application/confirm-plan-upgrade-order.usecase';
import { PayosWebhookAuthGuard } from './payos-webhook-auth.guard';
import { PayosWebhookDto } from './dto/payos-webhook.dto';

// constructor gains:
//   private readonly confirmUseCase: ConfirmPlanUpgradeOrderUseCase,

  @Post('webhook')
  @Public()
  @UseGuards(PayosWebhookAuthGuard, WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveWebhook(@Body() payload: PayosWebhookDto): Promise<{ received: true }> {
    await this.confirmUseCase.execute({
      orderCode: payload.data.orderCode,
      paymentSucceeded: payload.code === '00',
    });
    return { received: true };
  }
```

Full resulting file (for clarity — this replaces the Task 9 version in place):

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
import { ConfirmPlanUpgradeOrderUseCase } from '../application/confirm-plan-upgrade-order.usecase';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { InitiatePlanUpgradeOrderDto } from './dto/initiate-plan-upgrade-order.dto';
import type { PlanUpgradeOrderResponseDto } from './dto/plan-upgrade-order-response.dto';
import { PayosWebhookDto } from './dto/payos-webhook.dto';
import { PayosWebhookAuthGuard } from './payos-webhook-auth.guard';

@Controller('payos')
@UseGuards(PermissionGuard)
export class PayosController {
  constructor(
    private readonly initiateUseCase: InitiatePlanUpgradeOrderUseCase,
    private readonly confirmUseCase: ConfirmPlanUpgradeOrderUseCase,
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

  @Post('webhook')
  @Public()
  @UseGuards(PayosWebhookAuthGuard, WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveWebhook(
    @Body() payload: PayosWebhookDto,
  ): Promise<{ received: true }> {
    await this.confirmUseCase.execute({
      orderCode: payload.data.orderCode,
      paymentSucceeded: payload.code === '00',
    });
    return { received: true };
  }
}
```

Note: `@Controller('payos')` still carries `@UseGuards(PermissionGuard)` at class level (needed for `plan-upgrade-orders`); `webhook`'s `@Public()` + explicit `@UseGuards(PayosWebhookAuthGuard, WebhookRateLimitGuard)` on the method overrides the class-level guard for that route specifically, exactly matching how `BillingController`/`WebhooksController` already coexist as separate controllers — verify this dual-guard-on-one-controller composition compiles and behaves correctly in Step 3 below (NestJS merges class-level and method-level `@UseGuards()`, running both; `PermissionGuard` for a `@Public()` route must itself already skip permission checks — confirm this by reading `common/rbac/permission.guard.ts`'s handling of the `isPublic` metadata before assuming this composition is safe).

- [ ] **Step 3: Verify `PermissionGuard` skips `@Public()` routes**

Run: `npx tsc --noEmit` (from `apps/backend`), then read `apps/backend/src/common/rbac/permission.guard.ts` to confirm it checks the `isPublic` metadata (set by `@Public()`) and returns `true` early before requiring a permission — if it does not, **do not proceed**; instead split the webhook route into its own `@Controller('payos')`-free class (a second controller, e.g. `PayosWebhookController`, with no class-level `@UseGuards(PermissionGuard)`) so the public route is never reachable through the permission guard at all. This mirrors how `WebhooksController` in this repo has no `PermissionGuard` on it at all.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/payos/presentation/payos.controller.ts
git commit -m "feat: PayOS webhook endpoint driving ConfirmPlanUpgradeOrderUseCase"
```

---

## Task 13: `payos.module.ts` wiring + app registration

**Files:**
- Create: `apps/backend/src/modules/payos/payos.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: every provider/controller from Tasks 3–12.
- Produces: `PayosModule`, registered in `AppModule.imports`.

- [ ] **Step 1: Write the module**

```typescript
// apps/backend/src/modules/payos/payos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { ConfirmPlanUpgradeOrderUseCase } from './application/confirm-plan-upgrade-order.usecase';
import { InitiatePlanUpgradeOrderUseCase } from './application/initiate-plan-upgrade-order.usecase';
import { PAYOS_PAYMENT_ADAPTER } from './application/payos-payment-adapter.port';
import { PLAN_UPGRADE_ORDER_REPOSITORY } from './application/plan-upgrade-order-repository.port';
import { PayosAdapter } from './infrastructure/payos.adapter';
import { PlanUpgradeOrderOrmEntity } from './infrastructure/plan-upgrade-order.orm-entity';
import { TypeOrmPlanUpgradeOrderRepository } from './infrastructure/typeorm-plan-upgrade-order.repository';
import { PayosController } from './presentation/payos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanUpgradeOrderOrmEntity]),
    BillingModule,
  ],
  providers: [
    {
      provide: PLAN_UPGRADE_ORDER_REPOSITORY,
      useClass: TypeOrmPlanUpgradeOrderRepository,
    },
    { provide: PAYOS_PAYMENT_ADAPTER, useClass: PayosAdapter },
    InitiatePlanUpgradeOrderUseCase,
    ConfirmPlanUpgradeOrderUseCase,
  ],
  controllers: [PayosController],
})
export class PayosModule {}
```

`AUDIT_LOG_REPOSITORY` is **not** re-bound here: `common/audit/audit.module.ts` is `@Global()` and already exports it (confirmed by reading that file and by `payments.module.ts` not re-binding it either) — `ConfirmPlanUpgradeOrderUseCase`'s `@Inject(AUDIT_LOG_REPOSITORY)` resolves from the global `AuditModule` automatically.

- [ ] **Step 2: Register in `AppModule`**

```typescript
// apps/backend/src/app.module.ts
// Add to imports, near BillingModule/WebhooksModule:
import { PayosModule } from './modules/payos/payos.module';
// ...
// imports: [ ..., BillingModule, PayosModule, ... ]
```

- [ ] **Step 3: Boot the app to verify wiring**

Run: `pnpm dev:backend` (from repo root, requires local Postgres/Redis running per `.env`), watch for successful Nest module initialization with no `UnknownDependenciesException` for `PayosModule`'s providers; stop the process once boot succeeds.

- [ ] **Step 4: Run domain-check**

Run the `domain-check` skill (`/domain-check`) per AGENTS.md — fix any Clean Architecture boundary violations it reports before proceeding.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payos/payos.module.ts apps/backend/src/app.module.ts
git commit -m "feat: wire up PayosModule in AppModule"
```

---

## Task 14: End-to-end test for the full PayOS flow

**Files:**
- Create: `apps/backend/test/payos-plan-upgrade.e2e-spec.ts`

**Interfaces:**
- Consumes: `PayosModule` (Task 13, overridden to substitute a fake `IPayosPaymentAdapter` so no real network call to PayOS happens), `PLAN_UPGRADE_ORDER_REPOSITORY`/`PAYOS_PAYMENT_ADAPTER` DI tokens.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/backend/test/payos-plan-upgrade.e2e-spec.ts
import { createHmac } from 'node:crypto';
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import type { IPayosPaymentAdapter } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PAYOS_PAYMENT_ADAPTER } from '../src/modules/payos/application/payos-payment-adapter.port';
import { PlanUpgradeOrderOrmEntity } from '../src/modules/payos/infrastructure/plan-upgrade-order.orm-entity';

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

describe('PayOS plan upgrade (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

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
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  async function setUpOrg(organizationId: string, role: Role) {
    const userId = '00000000-0000-4000-8000-000000000500';
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'PayOS Test User',
      email: 'payos-test@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role });
    return { token };
  }

  async function seedFreeSubscription(organizationId: string) {
    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: `sub-${organizationId}`,
      organizationId,
      planId: PlanId.FREE,
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 50,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
      createdAt: now,
    });
  }

  it('creates a checkout link, then a PAID webhook confirms the plan upgrade', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000501';
    const { token } = await setUpOrg(organizationId, Role.OWNER);
    await seedFreeSubscription(organizationId);

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/payos/plan-upgrade-orders')
      .set('Authorization', `Bearer ${token}`)
      .set('idempotency-key', 'test-key-1')
      .send({
        targetPlanId: PlanId.STARTER,
        returnUrl: 'https://app.casso.vn/billing?status=success',
        cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
      })
      .expect(201);

    expect(initiateRes.body.checkoutUrl).toMatch(/^https:\/\/pay\.payos\.vn\//);

    const order = await dataSource
      .getRepository(PlanUpgradeOrderOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    const orderCode = Number(order.orderCode);

    const webhookData = {
      orderCode,
      amount: 299000,
      description: 'Nang cap goi STARTER',
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

    const subscriptionRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subscriptionRow.planId).toBe(PlanId.STARTER);

    const orderRow = await dataSource
      .getRepository(PlanUpgradeOrderOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(orderRow.status).toBe('PAID');
  });

  it('replaying the same PAID webhook is a no-op (idempotent)', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000502';
    const { token } = await setUpOrg(organizationId, Role.OWNER);
    await seedFreeSubscription(organizationId);

    await request(app.getHttpServer())
      .post('/api/v1/payos/plan-upgrade-orders')
      .set('Authorization', `Bearer ${token}`)
      .set('idempotency-key', 'test-key-2')
      .send({
        targetPlanId: PlanId.STARTER,
        returnUrl: 'https://app.casso.vn/billing',
        cancelUrl: 'https://app.casso.vn/billing',
      })
      .expect(201);

    const order = await dataSource
      .getRepository(PlanUpgradeOrderOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    const orderCode = Number(order.orderCode);
    const webhookData = {
      orderCode,
      amount: 299000,
      description: 'x',
      code: '00',
      desc: 'success',
    };
    const body = {
      code: '00',
      desc: 'success',
      success: true,
      data: webhookData,
      signature: signWebhookData(webhookData),
    };

    await request(app.getHttpServer()).post('/api/v1/payos/webhook').send(body).expect(200);
    await request(app.getHttpServer()).post('/api/v1/payos/webhook').send(body).expect(200);

    const subRow = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOneOrFail({ where: { organizationId } });
    expect(subRow.planId).toBe(PlanId.STARTER); // still STARTER, not double-processed
  });

  it('rejects a webhook with a bad signature', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payos/webhook')
      .send({
        code: '00',
        desc: 'success',
        success: true,
        data: { orderCode: 999999, amount: 1, description: 'x', code: '00', desc: 'success' },
        signature: 'not-a-real-signature',
      })
      .expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern payos-plan-upgrade` (requires Docker running, for testcontainers)
Expected: FAIL initially (module not wired, or a specific assertion failing) — confirms the test actually exercises the new code before Task 13's wiring is trusted blindly.

- [ ] **Step 3: Fix any wiring/behavior gaps surfaced by the failing test**

Iterate on Tasks 4–13's code until all three `it()` blocks pass — do not change the test's assertions to make them pass; if an assertion seems wrong, stop and re-examine the corresponding task's design against this plan's Architecture section.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern payos-plan-upgrade`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full verification suite**

```bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e
npx tsc --noEmit
npx biome check --write .
```

All must pass before this task is considered done, per `CLAUDE.local.md`'s pre-commit checklist.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/test/payos-plan-upgrade.e2e-spec.ts
git commit -m "test: e2e coverage for PayOS payment-initiation and webhook flow"
```

---

## Post-plan follow-ups (explicitly out of scope, noted for later)

- Reconciliation/polling job for orders stuck in `PENDING` (see Task 11's `ponytail:` note).
- Registering the webhook URL with PayOS via `POST /confirm-webhook` — a one-time manual ops step, not code (see grilling summary).
- `PAST_DUE`/`CANCELLED` `SubscriptionStatus` remain unused after this plan — reserved for a future recurring-billing/renewal-failure feature, not this one-time-upgrade-payment flow.
- FE integration (redirect-to-checkout UI, polling/webhook-driven success screen) is issue #153, blocked by this plan.
