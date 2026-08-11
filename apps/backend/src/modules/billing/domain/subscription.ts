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

// ponytail: FREE only — matches the spec's worked example (50/1). No
// upgrade/downgrade path reads STARTER/BUSINESS/ENTERPRISE limits yet; add
// them back (from a real Plan catalog, spec section 10) when one does.
const FREE_PLAN_LIMITS = {
  receivableMonthlyLimit: 50,
  bankConnectionLimit: 1,
  copilotChatMonthlyLimit: 50,
  canUseCustomSmtp: false,
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
    return new Subscription({
      id,
      organizationId,
      planId: PlanId.FREE,
      receivableMonthlyLimit: FREE_PLAN_LIMITS.receivableMonthlyLimit,
      bankConnectionLimit: FREE_PLAN_LIMITS.bankConnectionLimit,
      copilotChatMonthlyLimit: FREE_PLAN_LIMITS.copilotChatMonthlyLimit,
      canUseCustomSmtp: FREE_PLAN_LIMITS.canUseCustomSmtp,
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
