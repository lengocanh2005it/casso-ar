import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';

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

// ponytail: placeholder limits — spec section 10 (real pricing catalog) isn't
// in this repo yet. Free matches the spec's worked example (50/1); the rest
// are reasonable guesses. Replace once a real Plan catalog ships.
export const PLAN_LIMITS: Record<
  PlanId,
  { receivableMonthlyLimit: number; bankConnectionLimit: number }
> = {
  [PlanId.FREE]: { receivableMonthlyLimit: 50, bankConnectionLimit: 1 },
  [PlanId.STARTER]: { receivableMonthlyLimit: 300, bankConnectionLimit: 3 },
  [PlanId.BUSINESS]: { receivableMonthlyLimit: 1000, bankConnectionLimit: 10 },
  [PlanId.ENTERPRISE]: {
    receivableMonthlyLimit: 1_000_000,
    bankConnectionLimit: 1_000,
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

  static createFree(
    id: string,
    organizationId: string,
    now: Date,
  ): Subscription {
    const limits = PLAN_LIMITS[PlanId.FREE];
    return new Subscription({
      id,
      organizationId,
      planId: PlanId.FREE,
      receivableMonthlyLimit: limits.receivableMonthlyLimit,
      bankConnectionLimit: limits.bankConnectionLimit,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: startOfMonth(now),
      currentPeriodEnd: startOfNextMonth(now),
      createdAt: now,
    });
  }

  isReceivableLimitReached(receivablesThisMonth: number): boolean {
    return receivablesThisMonth >= this.receivableMonthlyLimit;
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
