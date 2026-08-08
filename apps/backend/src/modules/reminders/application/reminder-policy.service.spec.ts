import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderPolicyService } from './reminder-policy.service';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

const tenantContext = {
  getOrganizationId: jest.fn().mockReturnValue('org-1'),
} as unknown as TenantContextService;

describe('ReminderPolicyService', () => {
  it('creates one policy and replaces its rules atomically', async () => {
    const policyRepo = {
      findByCustomerGroup: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      findAll: jest.fn(),
    };
    const ruleRepo = { replaceForPolicy: jest.fn() };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb({})),
    };
    const service = new ReminderPolicyService(
      policyRepo as unknown as IReminderPolicyRepository,
      ruleRepo as unknown as IReminderRuleRepository,
      dataSource as unknown as DataSource,
      tenantContext,
    );

    const result = await service.create({
      customerGroup: CustomerGroup.VIP,
      isActive: true,
      rules: [
        { offsetDays: -5, emailTemplateId: 'template-1', minIntervalDays: 7 },
      ],
    });

    expect(result.customerGroup).toBe(CustomerGroup.VIP);
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
    const service = new ReminderPolicyService(
      policyRepo as unknown as IReminderPolicyRepository,
      { replaceForPolicy: jest.fn() } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext,
    );

    await expect(
      service.create({
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
    const service = new ReminderPolicyService(
      policyRepo as unknown as IReminderPolicyRepository,
      { replaceForPolicy: jest.fn() } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext,
    );

    await expect(
      service.create({
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

  it('update() loads the policy by id and rejects with NOT_FOUND when missing', async () => {
    const policyRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findAll: jest.fn(),
    };
    const service = new ReminderPolicyService(
      policyRepo as unknown as IReminderPolicyRepository,
      { replaceForPolicy: jest.fn() } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext,
    );

    await expect(
      service.update('missing-id', { isActive: true, rules: [] }),
    ).rejects.toMatchObject(
      new AppError(ErrorCode.NOT_FOUND, 'Reminder policy not found'),
    );
    expect(policyRepo.findById).toHaveBeenCalledWith('missing-id');
    expect(policyRepo.findAll).not.toHaveBeenCalled();
  });

  it('update() replaces rules for an existing policy found by id', async () => {
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
    const service = new ReminderPolicyService(
      policyRepo as unknown as IReminderPolicyRepository,
      ruleRepo as unknown as IReminderRuleRepository,
      dataSource as unknown as DataSource,
      tenantContext,
    );

    const result = await service.update('policy-1', {
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

  it('lists all policies for the organization', async () => {
    const policies = [
      { id: 'p1', customerGroup: CustomerGroup.VIP },
      { id: 'p2', customerGroup: CustomerGroup.REGULAR },
    ];
    const policyRepo = {
      findAll: jest.fn().mockResolvedValue(policies),
      findByCustomerGroup: jest.fn(),
      save: jest.fn(),
    };
    const service = new ReminderPolicyService(
      policyRepo as unknown as IReminderPolicyRepository,
      { replaceForPolicy: jest.fn() } as unknown as IReminderRuleRepository,
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext,
    );

    const result = await service.list();
    expect(result).toHaveLength(2);
  });
});
