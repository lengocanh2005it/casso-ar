import { PlanId, PlanUpgradeOrderStatus } from '@casso-ar/shared-types';
import { DataSource } from 'typeorm';
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
      findAllPaidTierActive: jest.fn(),
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
          quotedAmount: 299000,
          payosPaymentLinkId: null,
          status: PlanUpgradeOrderStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      lockAndFindByOrderCode: jest.fn(),
      lockAndFindByIdAndOrganizationId: jest.fn(),
      save: jest.fn(),
      existsPaidWithinRange: jest.fn(),
    };
    const adapter: jest.Mocked<IPayosPaymentAdapter> = {
      createPaymentLink: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://pay.payos.vn/x',
        orderCode: 1001,
        paymentLinkId: 'payos-link-1',
      }),
      getPaymentLink: jest.fn(),
    };
    const manager = {};
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(manager),
      ),
    } as unknown as DataSource;
    const useCase = new InitiatePlanUpgradeOrderUseCase(
      orderRepo,
      subscriptionRepo,
      adapter,
      dataSource,
    );
    return {
      useCase,
      subscriptionRepo,
      orderRepo,
      adapter,
      dataSource,
      manager,
    };
  }

  it('creates an order and returns the PayOS checkout URL for a valid upgrade', async () => {
    const { useCase, orderRepo, adapter, dataSource, manager } = buildDeps();
    const result = await useCase.execute({
      organizationId: 'org-1',
      targetPlanId: PlanId.STARTER,
      returnUrl: 'https://app.casso.vn/billing?status=success',
      cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
    });

    expect(result).toEqual({
      checkoutUrl: 'https://pay.payos.vn/x',
      orderCode: '1001',
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(orderRepo.create).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        targetPlanId: PlanId.STARTER,
        quotedAmount: 299000,
      },
      manager,
    );
    expect(adapter.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ orderCode: 1001, amount: 299000 }),
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ payosPaymentLinkId: 'payos-link-1' }),
      undefined,
      'org-1',
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
