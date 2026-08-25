import { PlanId } from '@casso-ar/shared-types';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import { PeriodCharge } from '../domain/period-charge';
import { InitiatePeriodChargeUseCase } from './initiate-period-charge.usecase';
import type { IPayosPaymentAdapter } from './payos-payment-adapter.port';
import type { IPeriodChargeRepository } from './period-charge-repository.port';

describe('InitiatePeriodChargeUseCase', () => {
  function buildDeps(subscription: Subscription | null) {
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findAllPaidTierActive: jest.fn(),
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
