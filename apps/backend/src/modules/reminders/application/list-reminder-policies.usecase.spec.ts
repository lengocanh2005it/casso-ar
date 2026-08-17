import { CustomerGroup } from '../../customers/domain/customer-group';
import { ListReminderPoliciesUseCase } from './list-reminder-policies.usecase';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

describe('ListReminderPoliciesUseCase', () => {
  it('lists all policies for the organization', async () => {
    const policies = [
      { id: 'p1', customerGroup: CustomerGroup.VIP },
      { id: 'p2', customerGroup: CustomerGroup.REGULAR },
    ];
    const policyRepo = {
      findAll: jest.fn().mockResolvedValue(policies),
    };
    const useCase = new ListReminderPoliciesUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      {
        findByPolicyIds: jest.fn().mockResolvedValue([]),
      } as unknown as IReminderRuleRepository,
    );

    const result = await useCase.execute();
    expect(result).toHaveLength(2);
  });

  it('includes each policy rule in the list response without an N+1 lookup', async () => {
    const policies = [
      {
        id: 'p1',
        organizationId: 'org-1',
        customerGroup: CustomerGroup.VIP,
        isActive: true,
        escalationThresholdDays: 30,
        createdAt: new Date(),
      },
    ];
    const rules = [
      {
        id: 'r1',
        reminderPolicyId: 'p1',
        offsetDays: -3,
        emailTemplateId: 'template-1',
        minIntervalDays: 1,
        createdAt: new Date(),
      },
    ];
    const policyRepo = {
      findAll: jest.fn().mockResolvedValue(policies),
    };
    const ruleRepo = {
      findByPolicyIds: jest.fn().mockResolvedValue(rules),
    };
    const useCase = new ListReminderPoliciesUseCase(
      policyRepo as unknown as IReminderPolicyRepository,
      ruleRepo as unknown as IReminderRuleRepository,
    );

    const result = await useCase.execute();

    expect(ruleRepo.findByPolicyIds).toHaveBeenCalledWith(['p1']);
    expect(result[0].rules).toEqual(rules);
  });
});
