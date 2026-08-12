import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';

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
}

const PLAN_CATALOG: Record<PlanId, PlanConfig> = {
  [PlanId.FREE]: {
    receivableMonthlyLimit: 50,
    bankConnectionLimit: 1,
    copilotChatMonthlyLimit: 50,
    canUseCustomSmtp: false,
  },
  [PlanId.STARTER]: {
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
  },
  [PlanId.BUSINESS]: {
    receivableMonthlyLimit: 5000,
    bankConnectionLimit: 5,
    copilotChatMonthlyLimit: 1000,
    canUseCustomSmtp: true,
  },
  [PlanId.ENTERPRISE]: {
    receivableMonthlyLimit: 15000,
    bankConnectionLimit: 10,
    copilotChatMonthlyLimit: 10000,
    canUseCustomSmtp: true,
  },
};

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

  static createFree(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    const plan = PLAN_CATALOG[PlanId.FREE];

    return new Subscription({
      id,
      organizationId,
      planId: PlanId.FREE,
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

  static createStarter(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    const plan = PLAN_CATALOG[PlanId.STARTER];

    return new Subscription({
      id,
      organizationId,
      planId: PlanId.STARTER,
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

  static createBusiness(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    const plan = PLAN_CATALOG[PlanId.BUSINESS];

    return new Subscription({
      id,
      organizationId,
      planId: PlanId.BUSINESS,
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

  static createEnterprise(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    const plan = PLAN_CATALOG[PlanId.ENTERPRISE];

    return new Subscription({
      id,
      organizationId,
      planId: PlanId.ENTERPRISE,
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
}
