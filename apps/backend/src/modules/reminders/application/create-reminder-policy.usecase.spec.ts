import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CustomerGroup } from '../../customers/domain/customer-group';
import { CreateReminderPolicyUseCase } from './create-reminder-policy.usecase';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

const tenantContext = {
  getOrganizationId: jest.fn().mockReturnValue('org-1'),
} as unknown as TenantContextService;

describe('CreateReminderPolicyUseCase', () => {
  it('creates one policy and replaces its rules atomically', async () => {
    const policyRepo = {
      findByCustomerGroup: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const ruleRepo = { replaceForPolicy: jest.fn() };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb({})),
    };
    const useCase = new CreateReminderPolicyUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      ruleRepo as unknown as IReminderRuleRepository,
      dataSource as unknown as DataSource,
      tenantContext,
    );

    const result = await useCase.execute({
      customerGroup: CustomerGroup.VIP,
      isActive: true,
      escalationThresholdDays: 14,
      rules: [
        { offsetDays: -5, emailTemplateId: 'template-1', minIntervalDays: 7 },
      ],
    });

    expect(result.customerGroup).toBe(CustomerGroup.VIP);
    expect(result.escalationThresholdDays).toBe(14);
    expect(ruleRepo.replaceForPolicy).toHaveBeenCalledWith(
      result.id,
      expect.arrayContaining([expect.objectContaining({ offsetDays: -5 })]),
      expect.anything(),
    );
  });

  it('rejects a second policy for the same customer group', async () => {
    const policyRepo = {
      findByCustomerGroup: jest.fn().mockResolvedValue({ id: 'existing' }),
    };
    const useCase = new CreateReminderPolicyUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      {
        replaceForPolicy: jest.fn(),
      } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext,
    );

    await expect(
      useCase.execute({
        customerGroup: CustomerGroup.REGULAR,
        isActive: true,
        rules: [],
      }),
    ).rejects.toMatchObject(
      new AppError(
        ErrorCode.CONFLICT,
        'Reminder policy already exists for customer group',
      ),
    );
  });

  it('rejects duplicate offsetDays with a VALIDATION_ERROR AppError', async () => {
    const policyRepo = {
      findByCustomerGroup: jest.fn().mockResolvedValue(null),
    };
    const useCase = new CreateReminderPolicyUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      {
        replaceForPolicy: jest.fn(),
      } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext,
    );

    await expect(
      useCase.execute({
        customerGroup: CustomerGroup.VIP,
        isActive: true,
        rules: [
          {
            offsetDays: -3,
            emailTemplateId: 'template-1',
            minIntervalDays: 7,
          },
          {
            offsetDays: -3,
            emailTemplateId: 'template-2',
            minIntervalDays: 7,
          },
        ],
      }),
    ).rejects.toMatchObject(
      new AppError(ErrorCode.VALIDATION_ERROR, 'Duplicate offsetDays values'),
    );
  });
});
