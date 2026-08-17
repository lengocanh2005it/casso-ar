# Plan Upgrade Use Case Design

> **Superseded:** `POST /api/v1/subscriptions/change-plan` was removed in issue #205 (2026-08-17) — the unguarded human-click path is gone. The single remaining upgrade path is the PayOS flow: `POST /payos/plan-upgrade-orders` → webhook → `ConfirmPlanUpgradeOrderUseCase` → `ChangeSubscriptionPlanUseCase` (still the internal application-layer entry point). Everything below describing the public HTTP endpoint is historical.

> Child spec of issue #150 (split out of #90 during grilling on 2026-08-12). See [ADR-0011](../../adr/0011-upgrade-only-plan-changes.md) for the upgrade-only-no-downgrade trade-off. Builds on #90's `PLAN_CATALOG`/`Subscription.createXxx()` (PR #151). Does **not** cover payment collection (#152, PayOS) or auto-downgrade-on-non-renewal (#153) — both are separate, later issues.

## 0. Problem & non-goals

An org's `Subscription` is created once at signup (always FREE, `SignupUseCase`) and never changes plan afterward — there is no code path that moves a `planId`. This spec adds the first one: a self-service upgrade.

**In scope:** an authenticated, permissioned user (OWNER or FINANCE_MANAGER) moves their org's `Subscription` to a strictly higher `PlanId` tier, effective immediately, for the remainder of the current billing period.

**Out of scope:**
- Downgrade or cancel (ADR-0011) — there is no such endpoint.
- Real payment verification — this endpoint trusts the caller (an OWNER/FINANCE_MANAGER who confirmed payment out-of-band, e.g. via sales) until #152 (PayOS) lands and calls the same use case from a webhook instead of a human clicking a button.
- Auto-downgrade to FREE on non-renewal (#153).
- Prorated billing, refunds — out of scope per `docs/overview.md`'s billing section ("Out of scope: overage billing, grace period, automatic billing invoices through CASSO").

## 1. Domain model

### 1.1 `PlanConfig` gains a `tier`

`apps/backend/src/modules/billing/domain/subscription.ts` — add `tier: number` to the existing `PlanConfig` interface and each `PLAN_CATALOG` entry:

```ts
interface PlanConfig {
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
  canUseCustomSmtp: boolean;
  tier: number;
}

const PLAN_CATALOG: Record<PlanId, PlanConfig> = {
  [PlanId.FREE]: { ...existing fields..., tier: 0 },
  [PlanId.STARTER]: { ...existing fields..., tier: 1 },
  [PlanId.BUSINESS]: { ...existing fields..., tier: 2 },
  [PlanId.ENTERPRISE]: { ...existing fields..., tier: 3 },
};
```

This is additive — `createFree()`/`createStarter()`/`createBusiness()`/`createEnterprise()` (via `createFromPlan`) are unaffected; `tier` just rides along in `PLAN_CATALOG[planId]` for the new method below to read.

### 1.2 `Subscription.changeToPlan()`

New instance method, same immutable-return shape as `rollToCurrentPeriodIfExpired`:

```ts
changeToPlan(newPlanId: PlanId, now: Date): Subscription {
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

Deliberately does **not** touch `currentPeriodStart`/`currentPeriodEnd`/`version` — the period stays whatever it already was (§3 of the grilling discussion: period is always the current calendar month, independent of plan); `version` increments through the normal optimistic-lock save path, not inside the domain method.

Plain `Error`, not `AppError` — domain layer must not know about HTTP (AGENTS.md).

## 2. Application layer

New file `apps/backend/src/modules/billing/application/change-subscription-plan.usecase.ts`. Mirrors `PlanLimitService`'s existing lock pattern (`lockAndFindByOrganizationId` under `pg_advisory_xact_lock`, no new repository method needed):

```ts
@Injectable()
export class ChangeSubscriptionPlanUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly repo: ISubscriptionRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(organizationId: string, newPlanId: PlanId): Promise<Subscription> {
    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.repo.lockAndFindByOrganizationId(organizationId, manager);
      if (!subscription) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy gói đăng ký của tổ chức.');
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

No `TenantContextService` dependency here — `organizationId` comes from the controller (via `TenantContextService.getOrganizationId()`), passed in as a plain argument, same as `PlanLimitService`'s pattern of keeping tenant lookup at the presentation/controller boundary where it's already resolved.

## 3. Presentation layer (new — `billing/` has none today)

### 3.1 Error code

`apps/backend/src/common/errors/error-code.ts` — add one entry:

```ts
INVALID_PLAN_TRANSITION = 'INVALID_PLAN_TRANSITION',
```

HTTP mapping in `HttpExceptionFilter` (or wherever the existing `ErrorCode → status` map lives): 400 Bad Request.

### 3.2 DTO

`apps/backend/src/modules/billing/presentation/dto/change-subscription-plan.dto.ts`:

```ts
export class ChangeSubscriptionPlanDto {
  @IsEnum(PlanId)
  planId: PlanId;
}
```

### 3.3 Controller

`apps/backend/src/modules/billing/presentation/billing.controller.ts` (new file — first controller in this module):

```ts
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
    const subscription = await this.changePlanUseCase.execute(organizationId, dto.planId);
    return toSubscriptionResponse(subscription);
  }
}
```

Route is `POST /api/v1/subscriptions/change-plan` (global `/api/v1` prefix per AGENTS.md). No idempotency-key requirement — unlike payment-adjacent writes elsewhere (disputes, allocations), a repeated call is naturally idempotent-ish in effect (retrying "change to STARTER" while already on STARTER just re-fails with `INVALID_PLAN_TRANSITION` since `newTier <= currentTier`), so `IdempotencyService` isn't needed here.

`AuditActionType.SUBSCRIPTION_CHANGE_PLAN` and `AuditEntityType.SUBSCRIPTION` already exist in `apps/backend/src/common/audit/audit.enums.ts` (unused today, apparently pre-scaffolded for this exact feature) — no enum changes needed.

### 3.4 Response DTO

`apps/backend/src/modules/billing/presentation/dto/subscription-response.dto.ts` — `toSubscriptionResponse(subscription)` mapping the fields safe to expose (`planId`, all 4 limit/flag fields, `status`, `currentPeriodStart`, `currentPeriodEnd`). Excludes `organizationId` and `version` per AGENTS.md's "Response DTOs: do not leak `organizationId`, `version`, or internal fields."

### 3.5 Module wiring

`apps/backend/src/modules/billing/billing.module.ts` — add `BillingController` to `controllers`, `ChangeSubscriptionPlanUseCase` to `providers`.

## 4. RBAC

`Permission.SUBSCRIPTION_MANAGE` already exists in `packages/shared-types/src/role-permissions.ts`, granted to `OWNER` and `FINANCE_MANAGER` — reused as-is, no shared-types changes.

## 5. What #152 (PayOS) will do differently

Once PayOS lands, its webhook handler calls `ChangeSubscriptionPlanUseCase.execute(organizationId, newPlanId)` directly (same signature) after verifying a successful payment — it does not go through `BillingController`, and does not need `SUBSCRIPTION_MANAGE` (a webhook has no user/role). `ChangeSubscriptionPlanUseCase` itself needs no changes for that caller to work; this is why the use case takes `organizationId`/`newPlanId` as plain arguments rather than reading them off `TenantContextService` internally.
