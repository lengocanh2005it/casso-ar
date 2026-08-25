import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Subscription, type SubscriptionProps } from '../domain/subscription';
import { ChangeSubscriptionPlanUseCase } from './change-subscription-plan.usecase';

describe('ChangeSubscriptionPlanUseCase', () => {
  const manager = {} as any;

  function activeSubscription(overrides: Partial<SubscriptionProps> = {}) {
    return new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: PlanId.FREE,
      receivableMonthlyLimit: 50,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 50,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: new Date('2026-08-01'),
      version: 1,
      ...overrides,
    });
  }

  function buildDataSource() {
    return {
      transaction: jest.fn((fn: (manager: unknown) => unknown) => fn(manager)),
    };
  }

  it('locks, upgrades, and saves the subscription for the caller organization', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription()),
      save: jest.fn(),
    };
    const dataSource = buildDataSource();
    const useCase = new ChangeSubscriptionPlanUseCase(
      repo as any,
      dataSource as any,
    );

    const result = await useCase.execute('org-1', PlanId.STARTER);

    expect(repo.lockAndFindByOrganizationId).toHaveBeenCalledWith(
      'org-1',
      manager,
    );
    expect(result.planId).toBe(PlanId.STARTER);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PlanId.STARTER }),
      manager,
      'org-1',
    );
  });

  it('throws NOT_FOUND when the organization has no subscription', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const dataSource = buildDataSource();
    const useCase = new ChangeSubscriptionPlanUseCase(
      repo as any,
      dataSource as any,
    );

    await expect(
      useCase.execute('org-1', PlanId.STARTER),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('wraps an invalid transition in an AppError with INVALID_PLAN_TRANSITION', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription({ planId: PlanId.BUSINESS })),
      save: jest.fn(),
    };
    const dataSource = buildDataSource();
    const useCase = new ChangeSubscriptionPlanUseCase(
      repo as any,
      dataSource as any,
    );

    await expect(
      useCase.execute('org-1', PlanId.STARTER),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      useCase.execute('org-1', PlanId.STARTER),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_PLAN_TRANSITION,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });
});
