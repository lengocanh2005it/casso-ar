import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  assertUniqueOffsetDays,
  buildReminderRules,
  ReminderPolicy,
  type ReminderRuleInput,
} from '../domain/reminder-policy';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

@Injectable()
export class UpdateReminderPolicyUseCase {
  constructor(
    @Inject('IReminderPolicyRepository')
    private readonly policyRepo: IReminderPolicyRepository,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    id: string,
    input: {
      isActive: boolean;
      escalationThresholdDays?: number;
      rules: ReminderRuleInput[];
    },
  ): Promise<ReminderPolicy> {
    const policy = await this.policyRepo.findById(id);
    if (!policy) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Reminder policy not found');
    }

    assertUniqueOffsetDays(input.rules);

    const updated = new ReminderPolicy({
      ...policy,
      isActive: input.isActive,
      escalationThresholdDays:
        input.escalationThresholdDays ?? policy.escalationThresholdDays,
    });

    await this.dataSource.transaction(async (manager) => {
      await this.policyRepo.save(updated, manager);
      const rules = buildReminderRules(id, input.rules);
      await this.ruleRepo.replaceForPolicy(id, rules, manager);
    });

    return updated;
  }
}
