import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  assertUniqueOffsetDays,
  buildReminderRules,
  ReminderPolicy,
  type SaveReminderPolicyInput,
} from '../domain/reminder-policy';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

@Injectable()
export class CreateReminderPolicyUseCase {
  constructor(
    @Inject('IReminderPolicyRepository')
    private readonly policyRepo: IReminderPolicyRepository,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: SaveReminderPolicyInput): Promise<ReminderPolicy> {
    const organizationId = this.tenantContext.getOrganizationId();
    const existing = await this.policyRepo.findByCustomerGroup(
      input.customerGroup,
    );
    if (existing) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Reminder policy already exists for customer group',
      );
    }

    assertUniqueOffsetDays(input.rules);

    const policy = new ReminderPolicy({
      id: randomUUID(),
      organizationId,
      customerGroup: input.customerGroup,
      isActive: input.isActive,
      escalationThresholdDays: input.escalationThresholdDays,
      createdAt: new Date(),
    });

    await this.dataSource.transaction(async (manager) => {
      await this.policyRepo.save(policy, manager);
      const rules = buildReminderRules(policy.id, input.rules);
      await this.ruleRepo.replaceForPolicy(policy.id, rules, manager);
    });

    return policy;
  }
}
