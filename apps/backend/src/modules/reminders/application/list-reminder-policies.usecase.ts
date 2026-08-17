import { Inject, Injectable } from '@nestjs/common';
import { ReminderPolicy } from '../domain/reminder-policy';
import { ReminderRule } from '../domain/reminder-rule';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

@Injectable()
export class ListReminderPoliciesUseCase {
  constructor(
    @Inject('IReminderPolicyRepository')
    private readonly policyRepo: IReminderPolicyRepository,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
  ) {}

  async execute(): Promise<ReminderPolicy[]> {
    const policies = await this.policyRepo.findAll();
    const rules = await this.ruleRepo.findByPolicyIds(
      policies.map((policy) => policy.id),
    );
    const rulesByPolicyId = new Map<string, ReminderRule[]>();
    for (const rule of rules) {
      const policyRules = rulesByPolicyId.get(rule.reminderPolicyId) ?? [];
      policyRules.push(rule);
      rulesByPolicyId.set(rule.reminderPolicyId, policyRules);
    }

    return policies.map(
      (policy) =>
        new ReminderPolicy({
          ...policy,
          rules: rulesByPolicyId.get(policy.id) ?? [],
        }),
    );
  }
}
