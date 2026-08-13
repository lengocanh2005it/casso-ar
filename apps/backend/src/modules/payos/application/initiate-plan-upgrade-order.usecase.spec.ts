import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import { InitiatePlanUpgradeOrderUseCase } from './initiate-plan-upgrade-order.usecase';
import type { IPayosPaymentAdapter } from './payos-payment-adapter.port';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';

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
        .mockResolvedValue({
          checkoutUrl: 'https://pay.payos.vn/x',
          orderCode: 1001,
        }),
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
