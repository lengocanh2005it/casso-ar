import { DataSource } from 'typeorm';
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
    ).rejects.toThrow('Reminder policy already exists for customer group');
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
