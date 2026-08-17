import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CustomerGroup } from '../../customers/domain/customer-group';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';
import { UpdateReminderPolicyUseCase } from './update-reminder-policy.usecase';

const tenantContext = {
  getOrganizationId: jest.fn().mockReturnValue('org-1'),
} as unknown as TenantContextService;

describe('UpdateReminderPolicyUseCase', () => {
  it('loads the policy by id and rejects with NOT_FOUND when missing', async () => {
    const policyRepo = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const useCase = new UpdateReminderPolicyUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      { replaceForPolicy: jest.fn() } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
    );

    await expect(
      useCase.execute('missing-id', { isActive: true, rules: [] }),
    ).rejects.toMatchObject(
      new AppError(ErrorCode.NOT_FOUND, 'Reminder policy not found'),
    );
    expect(policyRepo.findById).toHaveBeenCalledWith('missing-id');
  });

  it('replaces rules for an existing policy found by id', async () => {
    const existingPolicy = {
      id: 'policy-1',
      organizationId: 'org-1',
      customerGroup: CustomerGroup.VIP,
      isActive: false,
      createdAt: new Date('2026-01-01'),
    };
    const policyRepo = {
      findById: jest.fn().mockResolvedValue(existingPolicy),
      save: jest.fn(),
    };
    const ruleRepo = { replaceForPolicy: jest.fn() };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb({})),
    };
    const useCase = new UpdateReminderPolicyUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      ruleRepo as unknown as IReminderRuleRepository,
      dataSource as unknown as DataSource,
    );

    const result = await useCase.execute('policy-1', {
      isActive: true,
      rules: [
        { offsetDays: 1, emailTemplateId: 'template-1', minIntervalDays: 7 },
      ],
    });

    expect(result.isActive).toBe(true);
    expect(ruleRepo.replaceForPolicy).toHaveBeenCalledWith(
      'policy-1',
      expect.arrayContaining([expect.objectContaining({ offsetDays: 1 })]),
      expect.anything(),
    );
  });
});
