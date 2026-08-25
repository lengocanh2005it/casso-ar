import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
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
