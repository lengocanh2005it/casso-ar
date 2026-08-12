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
