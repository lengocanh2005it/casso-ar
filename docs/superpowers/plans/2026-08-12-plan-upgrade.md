# Plan Upgrade Use Case Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an OWNER or FINANCE_MANAGER move their organization's `Subscription` to a strictly higher `PlanId` tier via `POST /api/v1/subscriptions/change-plan`, effective immediately.

**Architecture:** Add a `tier: number` to the existing `PlanConfig`/`PLAN_CATALOG` (`billing/domain/subscription.ts`, from issue #90) and a `Subscription.changeToPlan()` domain method that only accepts a strictly-higher target tier. Wrap it in a new `ChangeSubscriptionPlanUseCase` (application layer) that mirrors `PlanLimitService`'s existing `pg_advisory_xact_lock` pattern via `ISubscriptionRepository.lockAndFindByOrganizationId`. Expose it through `billing/`'s first-ever `presentation/` layer: one controller, two DTOs, one new `ErrorCode`.

**Tech Stack:** NestJS, TypeORM (`DataSource.transaction`, no new repository methods), class-validator, Jest + testcontainers for the e2e test. Builds on `billing/` as shipped by issue #90 (PR #151).

## Global Constraints

- Domain layer (`billing/domain/`) MUST NOT import NestJS/TypeORM; throws plain `Error`, never `AppError` (AGENTS.md).
- Every write is inside one DB transaction (`DataSource.transaction`); the advisory lock is acquired before reading the row.
- Every query/write scoped by `organizationId` — read it from `TenantContextService.getOrganizationId()` in the controller, pass it into the use case as a plain argument (do not inject `TenantContextService` into the use case itself — keeps it callable from a future non-HTTP caller, e.g. #152's PayOS webhook).
- API prefix `/api/v1` (global, already configured — no action needed).
- Error shape `{ statusCode, errorCode, message, details? }`; `errorCode` is `UPPER_SNAKE_CASE`, stable for FE switching.
- Response DTOs must not leak `organizationId` or `version` (AGENTS.md).
- RBAC: reuse `Permission.SUBSCRIPTION_MANAGE` (already defined, granted to `OWNER` + `FINANCE_MANAGER` in `packages/shared-types/src/role-permissions.ts`) — no shared-types changes.
- Audit: reuse `AuditActionType.SUBSCRIPTION_CHANGE_PLAN` + `AuditEntityType.SUBSCRIPTION` (already defined in `apps/backend/src/common/audit/audit.enums.ts`, currently unused) — no enum changes.
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas — run `npx biome check --write .` before each commit.
- Commit convention: `feat: <description>`, no manual `Co-authored-by` trailer (the `prepare-commit-msg` husky hook adds it).
- TDD: RED → GREEN → REFACTOR for every task below; run the stated test command and confirm the failure reason before writing production code.

---

## Task 1: `PlanConfig.tier` + `Subscription.changeToPlan()`

**Files:**
- Modify: `apps/backend/src/modules/billing/domain/subscription.ts` (the `PlanConfig` interface and all 4 `PLAN_CATALOG` entries, currently lines 18-50; add one new instance method after `rollToCurrentPeriodIfExpired`)
- Test: `apps/backend/src/modules/billing/domain/subscription.spec.ts`

**Interfaces:**
- Produces: `PlanConfig.tier: number` on every `PLAN_CATALOG[planId]` entry (`FREE`→`0`, `STARTER`→`1`, `BUSINESS`→`2`, `ENTERPRISE`→`3`, internal to the module) and `Subscription.prototype.changeToPlan(newPlanId: PlanId, now: Date): Subscription`. Task 3's `ChangeSubscriptionPlanUseCase` calls the latter.

`tier` has no independently observable behavior on its own — it's only ever read from inside `changeToPlan`, so both land in one task with one RED→GREEN cycle rather than a `tier`-only task with no real assertion surface.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/billing/domain/subscription.spec.ts` (inside the existing `describe('Subscription', ...)` block, after the last `it`):

```ts
describe('changeToPlan', () => {
  it('moves to a strictly higher tier and applies the new plan limits', () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    const upgraded = subscription.changeToPlan(
      PlanId.STARTER,
      new Date('2026-08-16T00:00:00.000Z'),
    );

    expect(upgraded.planId).toBe(PlanId.STARTER);
    expect(upgraded.receivableMonthlyLimit).toBe(500);
    expect(upgraded.bankConnectionLimit).toBe(2);
    expect(upgraded.copilotChatMonthlyLimit).toBe(100);
    expect(upgraded.canUseCustomSmtp).toBe(false);
  });

  it('keeps the current billing period unchanged on an upgrade', () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    const upgraded = subscription.changeToPlan(
      PlanId.BUSINESS,
      new Date('2026-08-16T00:00:00.000Z'),
    );

    expect(upgraded.currentPeriodStart).toEqual(subscription.currentPeriodStart);
    expect(upgraded.currentPeriodEnd).toEqual(subscription.currentPeriodEnd);
  });

  it('rejects a same-tier or lower-tier target', () => {
    const subscription = Subscription.createBusiness(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    expect(() =>
      subscription.changeToPlan(PlanId.BUSINESS, new Date('2026-08-16T00:00:00.000Z')),
    ).toThrow('Cannot change plan from BUSINESS (tier 2) to BUSINESS (tier 2)');
    expect(() =>
      subscription.changeToPlan(PlanId.STARTER, new Date('2026-08-16T00:00:00.000Z')),
    ).toThrow('Cannot change plan from BUSINESS (tier 2) to STARTER (tier 1)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern subscription.spec.ts`
Expected: FAIL — `subscription.changeToPlan is not a function`.

- [ ] **Step 3: Write minimal implementation**

First, update the `PlanConfig` interface and every `PLAN_CATALOG` entry in `apps/backend/src/modules/billing/domain/subscription.ts` (only the 4 field lists gain `tier: <n>,` — every other field in each entry is unchanged from what #90 shipped):

```ts
interface PlanConfig {
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
  canUseCustomSmtp: boolean;
  tier: number;
}

const PLAN_CATALOG: Record<PlanId, PlanConfig> = {
  [PlanId.FREE]: {
    receivableMonthlyLimit: 50,
    bankConnectionLimit: 1,
    copilotChatMonthlyLimit: 50,
    canUseCustomSmtp: false,
    tier: 0,
  },
  [PlanId.STARTER]: {
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
    tier: 1,
  },
  [PlanId.BUSINESS]: {
    receivableMonthlyLimit: 5000,
    bankConnectionLimit: 5,
    copilotChatMonthlyLimit: 1000,
    canUseCustomSmtp: true,
    tier: 2,
  },
  [PlanId.ENTERPRISE]: {
    receivableMonthlyLimit: 15000,
    bankConnectionLimit: 10,
    copilotChatMonthlyLimit: 10000,
    canUseCustomSmtp: true,
    tier: 3,
  },
};
```

Then add this instance method to the `Subscription` class, right after `rollToCurrentPeriodIfExpired` (`PLAN_CATALOG` is module-private — `changeToPlan` reads it directly, no new export needed):

```ts
changeToPlan(newPlanId: PlanId, _now: Date): Subscription {
  const currentTier = PLAN_CATALOG[this.planId].tier;
  const newTier = PLAN_CATALOG[newPlanId].tier;

  if (newTier <= currentTier) {
    throw new Error(
      `Cannot change plan from ${this.planId} (tier ${currentTier}) to ${newPlanId} (tier ${newTier}): target tier must be strictly higher`,
    );
  }

  const plan = PLAN_CATALOG[newPlanId];
  return new Subscription({
    ...this,
    planId: newPlanId,
    receivableMonthlyLimit: plan.receivableMonthlyLimit,
    bankConnectionLimit: plan.bankConnectionLimit,
    copilotChatMonthlyLimit: plan.copilotChatMonthlyLimit,
    canUseCustomSmtp: plan.canUseCustomSmtp,
  });
}
```

`_now` is unused today (period is deliberately left untouched — see ADR-0011) but kept in the signature so Task 3's use case has one consistent "pass the current time" convention across every `Subscription` method it calls, matching `createFree`/`rollToCurrentPeriodIfExpired`'s existing shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern subscription.spec.ts`
Expected: PASS (all tests in the file, including the pre-existing ones from #90).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/domain/subscription.ts apps/backend/src/modules/billing/domain/subscription.spec.ts
git commit -m "feat: add Subscription.changeToPlan domain method"
```

---

## Task 2: `INVALID_PLAN_TRANSITION` error code

**Files:**
- Modify: `apps/backend/src/common/errors/error-code.ts`
- Modify: `apps/backend/src/common/errors/http-exception.filter.ts` (`statusForErrorCode`'s `statusByErrorCode` map)
- Modify: `AGENTS.md` (the `ErrorCode` constants list and the "API Error Codes" table)
- Test: `apps/backend/src/common/errors/http-exception.filter.spec.ts` (existing file, no new test needed — see Step 1)

**Interfaces:**
- Produces: `ErrorCode.INVALID_PLAN_TRANSITION` → HTTP 400. Task 3 throws this via `AppError`.

- [ ] **Step 1: Confirm the existing regression-guard test will catch a missing status mapping**

No new test to write — `http-exception.filter.spec.ts` already has a test named `'never silently falls back to 500 for an ErrorCode with a documented non-500 status'` that iterates every `ErrorCode` value and asserts each resolves to a real status. Adding a new `ErrorCode` member without a matching `statusByErrorCode` entry makes this existing test fail (it falls through to the `?? 500` default, and `INVALID_PLAN_TRANSITION` isn't in `expectedFiveHundredCodes`). That failure is this task's RED signal.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern http-exception.filter.spec.ts`
Expected: PASS at this point — the new `ErrorCode` doesn't exist yet, so nothing changed. Run it anyway to record the baseline (all green), then proceed to Step 3 and re-run in Step 4 to see it go RED, exactly as the enum member is added.

Add the enum member first, by itself:

```ts
// in apps/backend/src/common/errors/error-code.ts
export enum ErrorCode {
  // ...existing members...
  IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',
  INVALID_PLAN_TRANSITION = 'INVALID_PLAN_TRANSITION',
}
```

Run: `npx jest --testPathPattern http-exception.filter.spec.ts`
Expected: FAIL — the regression-guard test now iterates `INVALID_PLAN_TRANSITION`, gets the `?? 500` fallback, and `expect(statusCode).toBeLessThan(500)` fails.

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/common/errors/http-exception.filter.ts`, add one line to the `statusByErrorCode` map in `statusForErrorCode` (after `[ErrorCode.IDEMPOTENCY_KEY_REUSED]: 409,`):

```ts
[ErrorCode.INVALID_PLAN_TRANSITION]: 400,
```

Then update `AGENTS.md`:
- In the `ErrorCode` constants enum block, add `INVALID_PLAN_TRANSITION = 'INVALID_PLAN_TRANSITION',` after `IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',`.
- In the "Standard errorCode list" table, add a row: `| \`INVALID_PLAN_TRANSITION\` | 400 | Target plan tier is not strictly higher than the current plan |` after the `IDEMPOTENCY_KEY_REUSED` row.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern http-exception.filter.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/errors/error-code.ts apps/backend/src/common/errors/http-exception.filter.ts AGENTS.md
git commit -m "feat: add INVALID_PLAN_TRANSITION error code"
```

---

## Task 3: `ChangeSubscriptionPlanUseCase`

**Files:**
- Create: `apps/backend/src/modules/billing/application/change-subscription-plan.usecase.ts`
- Test: `apps/backend/src/modules/billing/application/change-subscription-plan.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISubscriptionRepository.lockAndFindByOrganizationId(organizationId, manager)` / `.save(subscription, manager, organizationId)` (both already exist, no repository changes needed), `Subscription.changeToPlan(newPlanId, now)` (Task 1), `ErrorCode.INVALID_PLAN_TRANSITION` (Task 2), `ErrorCode.NOT_FOUND` (already exists).
- Produces: `ChangeSubscriptionPlanUseCase.execute(organizationId: string, newPlanId: PlanId): Promise<Subscription>` — Task 5's controller calls this; #152 (PayOS, future issue) will call it too.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/billing/application/change-subscription-plan.usecase.spec.ts`:

```ts
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Subscription, type SubscriptionProps } from '../domain/subscription';
import { ChangeSubscriptionPlanUseCase } from './change-subscription-plan.usecase';

describe('ChangeSubscriptionPlanUseCase', () => {
  const manager = {} as any;

  function activeSubscription(overrides: Partial<SubscriptionProps> = {}) {
    return new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: PlanId.FREE,
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 50,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: new Date('2026-08-01'),
      version: 1,
      ...overrides,
    });
  }

  function buildDataSource() {
    return {
      transaction: jest.fn((fn: (manager: unknown) => unknown) => fn(manager)),
    };
  }

  it('locks, upgrades, and saves the subscription for the caller organization', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription()),
      save: jest.fn(),
    };
    const dataSource = buildDataSource();
    const useCase = new ChangeSubscriptionPlanUseCase(repo as any, dataSource as any);

    const result = await useCase.execute('org-1', PlanId.STARTER);

    expect(repo.lockAndFindByOrganizationId).toHaveBeenCalledWith('org-1', manager);
    expect(result.planId).toBe(PlanId.STARTER);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PlanId.STARTER }),
      manager,
      'org-1',
    );
  });

  it('throws NOT_FOUND when the organization has no subscription', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const dataSource = buildDataSource();
    const useCase = new ChangeSubscriptionPlanUseCase(repo as any, dataSource as any);

    await expect(useCase.execute('org-1', PlanId.STARTER)).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('wraps an invalid transition in an AppError with INVALID_PLAN_TRANSITION', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription({ planId: PlanId.BUSINESS })),
      save: jest.fn(),
    };
    const dataSource = buildDataSource();
    const useCase = new ChangeSubscriptionPlanUseCase(repo as any, dataSource as any);

    await expect(useCase.execute('org-1', PlanId.STARTER)).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(useCase.execute('org-1', PlanId.STARTER)).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_PLAN_TRANSITION,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern change-subscription-plan.usecase.spec.ts`
Expected: FAIL — `Cannot find module './change-subscription-plan.usecase'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/billing/application/change-subscription-plan.usecase.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { PlanId } from '@casso-ledger/shared-types';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Subscription } from '../domain/subscription';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from './subscription-repository.port';

@Injectable()
export class ChangeSubscriptionPlanUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly repo: ISubscriptionRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(organizationId: string, newPlanId: PlanId): Promise<Subscription> {
    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.repo.lockAndFindByOrganizationId(
        organizationId,
        manager,
      );
      if (!subscription) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy gói đăng ký của tổ chức.',
        );
      }

      let updated: Subscription;
      try {
        updated = subscription.changeToPlan(newPlanId, new Date());
      } catch (err) {
        throw new AppError(
          ErrorCode.INVALID_PLAN_TRANSITION,
          `Không thể chuyển sang gói ${newPlanId} từ gói hiện tại.`,
          { cause: err instanceof Error ? err.message : String(err) },
        );
      }

      await this.repo.save(updated, manager, organizationId);
      return updated;
    });
  }
}
```

Note: `PlanId` is imported with `import type` here because it's used only as a type (a parameter/return type), never in a constructor parameter or decorator — consistent with AGENTS.md's import rule. `Subscription` is likewise `import type` since it's only used as a type here, unlike in `subscription.ts` itself where it's the class being defined.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern change-subscription-plan.usecase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/application/change-subscription-plan.usecase.ts apps/backend/src/modules/billing/application/change-subscription-plan.usecase.spec.ts
git commit -m "feat: add ChangeSubscriptionPlanUseCase"
```

---

## Task 4: DTOs

**Files:**
- Create: `apps/backend/src/modules/billing/presentation/dto/change-subscription-plan.dto.ts`
- Create: `apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.ts`
- Test: `apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.spec.ts`

**Interfaces:**
- Consumes: `Subscription` (Task 1, unchanged shape).
- Produces: `ChangeSubscriptionPlanDto` (class-validator DTO, `planId: PlanId`), `toSubscriptionResponse(subscription: Subscription): SubscriptionResponseDto`. Task 5's controller uses both.

`ChangeSubscriptionPlanDto` has no independent runtime logic beyond class-validator decorators (validated by NestJS's global `ValidationPipe`, not unit-testable in isolation without bootstrapping the pipe) — per this repo's existing convention (see `open-dispute.dto.ts`, which also has no `.spec.ts`), it doesn't get its own spec file. `toSubscriptionResponse` is a plain function with real logic (field selection), so it does.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.spec.ts`:

```ts
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { Subscription } from '../../domain/subscription';
import { toSubscriptionResponse } from './subscription-response.dto';

describe('toSubscriptionResponse', () => {
  it('maps a Subscription to the response shape, excluding organizationId and version', () => {
    const subscription = new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: PlanId.STARTER,
      receivableMonthlyLimit: 500,
      bankConnectionLimit: 2,
      copilotChatMonthlyLimit: 100,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: new Date('2026-08-01'),
      version: 2,
    });

    expect(toSubscriptionResponse(subscription)).toEqual({
      id: 'sub-1',
      planId: PlanId.STARTER,
      receivableMonthlyLimit: 500,
      bankConnectionLimit: 2,
      copilotChatMonthlyLimit: 100,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern subscription-response.dto.spec.ts`
Expected: FAIL — `Cannot find module './subscription-response.dto'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/billing/presentation/dto/change-subscription-plan.dto.ts`:

```ts
import { PlanId } from '@casso-ledger/shared-types';
import { IsEnum } from 'class-validator';

export class ChangeSubscriptionPlanDto {
  @IsEnum(PlanId)
  planId: PlanId;
}
```

Create `apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.ts`:

```ts
import type { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import type { Subscription } from '../../domain/subscription';

export interface SubscriptionResponseDto {
  id: string;
  planId: PlanId;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
  canUseCustomSmtp: boolean;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export function toSubscriptionResponse(
  subscription: Subscription,
): SubscriptionResponseDto {
  return {
    id: subscription.id,
    planId: subscription.planId,
    receivableMonthlyLimit: subscription.receivableMonthlyLimit,
    bankConnectionLimit: subscription.bankConnectionLimit,
    copilotChatMonthlyLimit: subscription.copilotChatMonthlyLimit,
    canUseCustomSmtp: subscription.canUseCustomSmtp,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
}
```

`PlanId` in `change-subscription-plan.dto.ts` is a **value import** (not `import type`) — `@IsEnum(PlanId)` is a decorator argument, resolved at runtime, and class-validator/NestJS's `ValidationPipe` needs the real enum object, not just its type. This matches AGENTS.md's import rule for values used in decorators.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern subscription-response.dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/presentation/dto/change-subscription-plan.dto.ts apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.ts apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.spec.ts
git commit -m "feat: add billing presentation DTOs"
```

---

## Task 5: `BillingController` + module wiring

**Files:**
- Create: `apps/backend/src/modules/billing/presentation/billing.controller.ts`
- Modify: `apps/backend/src/modules/billing/billing.module.ts`
- Test: covered by Task 6's e2e test (this repo doesn't unit-test controllers in isolation — see `disputes/presentation/`, which has no controller `.spec.ts` either, only e2e coverage)

**Interfaces:**
- Consumes: `ChangeSubscriptionPlanUseCase` (Task 3), `ChangeSubscriptionPlanDto` / `toSubscriptionResponse` (Task 4), `TenantContextService.getOrganizationId()` (existing), `PermissionGuard` / `@RequirePermission` / `@Audited` (existing).
- Produces: `POST /api/v1/subscriptions/change-plan` — Task 6's e2e test calls this route.

- [ ] **Step 1: Write the failing test**

No new unit test — this task's correctness is proven by Task 6's e2e test, since a NestJS controller wired through guards/decorators/DI is only meaningfully testable through the full HTTP stack (the same reasoning `DisputesController` already follows in this codebase). Skip to Step 3.

- [ ] **Step 2: N/A**

Skipped for this task — see Step 1's rationale. (Task 6 provides this task's RED signal: the e2e test in Task 6 fails first because the route doesn't exist, which is this task's real failing-test checkpoint. Do Task 6's Steps 1-2 before this task's Step 3 if you want a literal RED to look at; otherwise proceed directly, since this task has no isolated unit-test surface.)

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/billing/presentation/billing.controller.ts`:

```ts
import { Permission } from '@casso-ledger/shared-types';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ChangeSubscriptionPlanUseCase } from '../application/change-subscription-plan.usecase';
import { ChangeSubscriptionPlanDto } from './dto/change-subscription-plan.dto';
import { toSubscriptionResponse } from './dto/subscription-response.dto';

@Controller('subscriptions')
@UseGuards(PermissionGuard)
export class BillingController {
  constructor(
    private readonly changePlanUseCase: ChangeSubscriptionPlanUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('change-plan')
  @Audited(AuditActionType.SUBSCRIPTION_CHANGE_PLAN, AuditEntityType.SUBSCRIPTION)
  @RequirePermission(Permission.SUBSCRIPTION_MANAGE)
  async changePlan(@Body() dto: ChangeSubscriptionPlanDto) {
    const organizationId = this.tenantContext.getOrganizationId();
    const subscription = await this.changePlanUseCase.execute(
      organizationId,
      dto.planId,
    );
    return toSubscriptionResponse(subscription);
  }
}
```

Modify `apps/backend/src/modules/billing/billing.module.ts` to the following (adds `BillingController` to `controllers` and `ChangeSubscriptionPlanUseCase` to `providers`; everything else is unchanged from #90):

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeSubscriptionPlanUseCase } from './application/change-subscription-plan.usecase';
import { PlanLimitService } from './application/plan-limit.service';
import { SUBSCRIPTION_REPOSITORY } from './application/subscription-repository.port';
import { SubscriptionOrmEntity } from './infrastructure/subscription.orm-entity';
import { TypeOrmSubscriptionRepository } from './infrastructure/typeorm-subscription.repository';
import { BillingController } from './presentation/billing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionOrmEntity])],
  controllers: [BillingController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    PlanLimitService,
    ChangeSubscriptionPlanUseCase,
  ],
  exports: [PlanLimitService, SUBSCRIPTION_REPOSITORY, TypeOrmModule],
})
export class BillingModule {}
```

- [ ] **Step 4: N/A**

No isolated verification for this task — proceed to Task 6, whose e2e test is this task's actual passing-test checkpoint.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/presentation/billing.controller.ts apps/backend/src/modules/billing/billing.module.ts
git commit -m "feat: add BillingController for plan changes"
```

---

## Task 6: End-to-end test

**Files:**
- Create: `apps/backend/test/plan-upgrade.e2e-spec.ts`

**Interfaces:**
- Consumes: the full stack wired by Tasks 1-5 — `POST /api/v1/subscriptions/change-plan`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/test/plan-upgrade.e2e-spec.ts`, following the exact bootstrap pattern of `apps/backend/test/billing-quota.e2e-spec.ts` (testcontainers Postgres, `AppModule`, JWT signing):

```ts
import { PlanId, Permission, SubscriptionStatus } from '@casso-ledger/shared-types';
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

describe('Plan upgrade (integration)', () => {
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
    const userId = '00000000-0000-4000-8000-000000000400';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: 'plan-upgrade-test@example.com',
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

  it('upgrades an OWNER-owned FREE subscription to STARTER', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000401';
    const { token } = await setUpOrg(organizationId, Role.OWNER);

    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-4000-8000-000000000402',
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

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/change-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: PlanId.STARTER })
      .expect(201);

    expect(res.body.planId).toBe(PlanId.STARTER);
    expect(res.body.receivableMonthlyLimit).toBe(500);
    expect(res.body.organizationId).toBeUndefined();
    expect(res.body.version).toBeUndefined();

    const row = await dataSource
      .getRepository(SubscriptionOrmEntity)
      .findOne({ where: { organizationId } });
    expect(row?.planId).toBe(PlanId.STARTER);
  });

  it('rejects a downgrade with 400 INVALID_PLAN_TRANSITION', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000403';
    const { token } = await setUpOrg(organizationId, Role.OWNER);

    const now = new Date();
    await dataSource.getRepository(SubscriptionOrmEntity).save({
      id: '00000000-0000-4000-8000-000000000404',
      organizationId,
      planId: PlanId.BUSINESS,
      receivableMonthlyLimit: 5000,
      bankConnectionLimit: 5,
      copilotChatMonthlyLimit: 1000,
      canUseCustomSmtp: true,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
      createdAt: now,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/change-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: PlanId.STARTER })
      .expect(400);

    expect(res.body.errorCode).toBe('INVALID_PLAN_TRANSITION');
  });

  it('forbids a VIEWER from changing the plan', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000405';
    const { token } = await setUpOrg(organizationId, Role.VIEWER);

    await request(app.getHttpServer())
      .post('/api/v1/subscriptions/change-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: PlanId.STARTER })
      .expect(403);
  });
});
```

`Permission` is imported but unused in the final file above — remove that import; the test only needs `Role` for signing tokens (the permission check happens server-side via `PermissionGuard`, not asserted directly against the `Permission` enum in this test).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern plan-upgrade` (requires Docker for the testcontainer)
Expected: FAIL — `404 Not Found` on `POST /api/v1/subscriptions/change-plan` if Task 5 wasn't done yet, or (if Task 5 is already done) this step should already pass. Since Tasks 1-5 precede this task in execution order, this test is expected to **pass immediately** — that's fine; it's still the correctness checkpoint for Task 5, just observed retroactively. If it fails for any reason other than "everything already worked," treat that as a real bug in Tasks 1-5 and fix it before proceeding.

- [ ] **Step 3: N/A**

No new production code — this task only adds the e2e test. If Step 2 revealed a real failure, go back and fix the relevant earlier task, then return here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern plan-upgrade`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/plan-upgrade.e2e-spec.ts
git commit -m "test: add plan-upgrade e2e coverage"
```

---

## Final verification (not a task — run once after Task 6)

```bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e
npx tsc --noEmit   # from apps/backend/
npx biome check --write .
```

Then run `/domain-check` and `/verification-before-completion` per AGENTS.md before opening a PR. Do not open the PR without explicit go-ahead — same as #90's workflow.
