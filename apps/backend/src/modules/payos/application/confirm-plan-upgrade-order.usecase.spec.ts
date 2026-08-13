import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { DataSource } from 'typeorm';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import type { ChangeSubscriptionPlanUseCase } from '../../billing/application/change-subscription-plan.usecase';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import { ConfirmPlanUpgradeOrderUseCase } from './confirm-plan-upgrade-order.usecase';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';

function buildOrder(status = PlanUpgradeOrderStatus.PENDING): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: 'order-1',
    orderCode: 1001,
    organizationId: 'org-1',
    targetPlanId: PlanId.STARTER,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ConfirmPlanUpgradeOrderUseCase', () => {
  function buildDeps(existingOrder: PlanUpgradeOrder | null) {
    const orderRepo: jest.Mocked<IPlanUpgradeOrderRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn().mockResolvedValue(existingOrder),
      save: jest.fn(),
      existsPaidWithinRange: jest.fn(),
    };
    const changePlanUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ChangeSubscriptionPlanUseCase>;
    const auditLogRepo: jest.Mocked<IAuditLogRepository> = {
      create: jest.fn(),
      findPage: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
    } as unknown as DataSource;
    const useCase = new ConfirmPlanUpgradeOrderUseCase(
      orderRepo,
      changePlanUseCase,
      auditLogRepo,
      dataSource,
    );
    return { useCase, orderRepo, changePlanUseCase, auditLogRepo };
  }

  it('on success, calls ChangeSubscriptionPlanUseCase, marks the order PAID, and writes an audit log', async () => {
    const { useCase, orderRepo, changePlanUseCase, auditLogRepo } = buildDeps(
      buildOrder(),
    );
    await useCase.execute({ orderCode: 1001, paymentSucceeded: true });

    expect(changePlanUseCase.execute).toHaveBeenCalledWith(
      'org-1',
      PlanId.STARTER,
      expect.anything(),
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PlanUpgradeOrderStatus.PAID }),
      expect.anything(),
      'org-1',
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'system',
      }),
      expect.anything(),
    );
  });

  it('on failure code, marks the order FAILED without calling ChangeSubscriptionPlanUseCase', async () => {
    const { useCase, orderRepo, changePlanUseCase } = buildDeps(buildOrder());
    await useCase.execute({ orderCode: 1001, paymentSucceeded: false });

    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PlanUpgradeOrderStatus.FAILED }),
      expect.anything(),
      'org-1',
    );
  });

  it('is idempotent: a webhook replay for an already-terminal order is a no-op', async () => {
    const { useCase, orderRepo, changePlanUseCase } = buildDeps(
      buildOrder(PlanUpgradeOrderStatus.PAID),
    );
    await useCase.execute({ orderCode: 1001, paymentSucceeded: true });

    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op (does not throw) when orderCode is unknown', async () => {
    const { useCase, changePlanUseCase } = buildDeps(null);
    await expect(
      useCase.execute({ orderCode: 999999, paymentSucceeded: true }),
    ).resolves.toBeUndefined();
    expect(changePlanUseCase.execute).not.toHaveBeenCalled();
  });
});
