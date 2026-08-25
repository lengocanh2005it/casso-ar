import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';

export interface SubscriptionProps {
  id: string;
  organizationId: string;
  planId: PlanId;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
  canUseCustomSmtp: boolean;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  version: number;
}

interface PlanConfig {
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
  canUseCustomSmtp: boolean;
  tier: number;
  priceVnd: number;
}

const PLAN_CATALOG: Record<PlanId, PlanConfig> = {
  [PlanId.FREE]: {
    receivableMonthlyLimit: 50,
    bankConnectionLimit: 1,
    copilotChatMonthlyLimit: 50,
    canUseCustomSmtp: false,
    tier: 0,
    priceVnd: 0,
  },
  [PlanId.STARTER]: {
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
    tier: 1,
    priceVnd: 299_000,
  },
  [PlanId.BUSINESS]: {
    receivableMonthlyLimit: 5000,
    bankConnectionLimit: 5,
    copilotChatMonthlyLimit: 1000,
    canUseCustomSmtp: true,
    tier: 2,
    priceVnd: 999_000,
  },
  [PlanId.ENTERPRISE]: {
    receivableMonthlyLimit: 15000,
    bankConnectionLimit: 10,
    copilotChatMonthlyLimit: 10000,
    canUseCustomSmtp: true,
    tier: 3,
    priceVnd: 2_999_000,
  },
};

export interface PlanCatalogEntry {
  planId: PlanId;
  priceVnd: number;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
}

export function getPlanCatalog(): PlanCatalogEntry[] {
  return (Object.keys(PLAN_CATALOG) as PlanId[]).map((planId) => ({
    planId,
    priceVnd: PLAN_CATALOG[planId].priceVnd,
    receivableMonthlyLimit: PLAN_CATALOG[planId].receivableMonthlyLimit,
    bankConnectionLimit: PLAN_CATALOG[planId].bankConnectionLimit,
    copilotChatMonthlyLimit: PLAN_CATALOG[planId].copilotChatMonthlyLimit,
  }));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export class Subscription {
  readonly id: string;
  readonly organizationId: string;
  readonly planId: PlanId;
  readonly receivableMonthlyLimit: number;
  readonly bankConnectionLimit: number;
  readonly copilotChatMonthlyLimit: number;
  readonly canUseCustomSmtp: boolean;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly createdAt: Date;
  readonly version: number;

  constructor(props: SubscriptionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.planId = props.planId;
    this.receivableMonthlyLimit = props.receivableMonthlyLimit;
    this.bankConnectionLimit = props.bankConnectionLimit;
    this.copilotChatMonthlyLimit = props.copilotChatMonthlyLimit;
    this.canUseCustomSmtp = props.canUseCustomSmtp;
    this.status = props.status;
    this.currentPeriodStart = props.currentPeriodStart;
    this.currentPeriodEnd = props.currentPeriodEnd;
    this.createdAt = props.createdAt;
    this.version = props.version;
  }

  private static createFromPlan(
    id: string,
    organizationId: string,
    now: Date,
    planId: PlanId,
  ): Subscription {
    const plan = PLAN_CATALOG[planId];

    return new Subscription({
      id,
      organizationId,
      planId,
      receivableMonthlyLimit: plan.receivableMonthlyLimit,
      bankConnectionLimit: plan.bankConnectionLimit,
      copilotChatMonthlyLimit: plan.copilotChatMonthlyLimit,
      canUseCustomSmtp: plan.canUseCustomSmtp,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: startOfMonth(now),
      currentPeriodEnd: startOfNextMonth(now),
      createdAt: now,
      version: 1,
    });
  }

  static createFree(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    return Subscription.createFromPlan(id, organizationId, now, PlanId.FREE);
  }

  static createStarter(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    return Subscription.createFromPlan(id, organizationId, now, PlanId.STARTER);
  }

  static createBusiness(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    return Subscription.createFromPlan(
      id,
      organizationId,
      now,
      PlanId.BUSINESS,
    );
  }

  static createEnterprise(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    return Subscription.createFromPlan(
      id,
      organizationId,
      now,
      PlanId.ENTERPRISE,
    );
  }

  isReceivableLimitReached(receivablesThisMonth: number): boolean {
    return receivablesThisMonth >= this.receivableMonthlyLimit;
  }

  isCopilotChatLimitReached(chatTurnsThisMonth: number): boolean {
    return chatTurnsThisMonth >= this.copilotChatMonthlyLimit;
  }

  // ponytail: no renewal cron exists yet (out of scope in the spec); roll the
  // calendar-month period lazily on read instead. Swap for a scheduled
  // renewal job if a real billing cycle (proration, invoicing) is added.
  rollToCurrentPeriodIfExpired(now: Date): Subscription {
    if (now.getTime() < this.currentPeriodEnd.getTime()) return this;
    return new Subscription({
      ...this,
      currentPeriodStart: startOfMonth(now),
      currentPeriodEnd: startOfNextMonth(now),
    });
  }

  isUpgradeTo(newPlanId: PlanId): boolean {
    return PLAN_CATALOG[newPlanId].tier > PLAN_CATALOG[this.planId].tier;
  }

  changeToPlan(newPlanId: PlanId): Subscription {
    if (!this.isUpgradeTo(newPlanId)) {
      throw new Error(
        `Cannot change plan from ${this.planId} (tier ${PLAN_CATALOG[this.planId].tier}) to ${newPlanId} (tier ${PLAN_CATALOG[newPlanId].tier}): target tier must be strictly higher`,
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

  // The only method allowed to move a Subscription to a LOWER tier — used
  // exclusively by the non-renewal downgrade path (#153, ADR-0012).
  // changeToPlan() enforces upgrade-only (ADR-0011); this deliberately
  // bypasses that check because FREE is always the target, never a
  // user-triggered downgrade.
  revertToFreeForNonRenewal(now: Date): Subscription {
    const plan = PLAN_CATALOG[PlanId.FREE];
    return new Subscription({
      ...this,
      planId: PlanId.FREE,
      currentPeriodStart: startOfMonth(now),
      currentPeriodEnd: startOfNextMonth(now),
      receivableMonthlyLimit: plan.receivableMonthlyLimit,
      bankConnectionLimit: plan.bankConnectionLimit,
      copilotChatMonthlyLimit: plan.copilotChatMonthlyLimit,
      canUseCustomSmtp: plan.canUseCustomSmtp,
    });
  }
}
