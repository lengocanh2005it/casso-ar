import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderPolicy } from '../domain/reminder-policy';
import { ReminderRule } from '../domain/reminder-rule';
import type { IReminderPolicyRepository } from './reminder-policy-repository.port';
import type { IReminderRuleRepository } from './reminder-rule-repository.port';

export interface ReminderRuleInput {
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
}

export interface SaveReminderPolicyInput {
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  rules: ReminderRuleInput[];
}

function assertUniqueOffsetDays(rules: ReminderRuleInput[]): void {
  const offsetDays = rules.map((r) => r.offsetDays);
  if (new Set(offsetDays).size !== offsetDays.length) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Duplicate offsetDays values',
    );
  }
}

@Injectable()
export class ReminderPolicyService {
  constructor(
    @Inject('IReminderPolicyRepository')
    private readonly policyRepo: IReminderPolicyRepository,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(input: SaveReminderPolicyInput): Promise<ReminderPolicy> {
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
      const rules = input.rules.map(
        (r) =>
          new ReminderRule({
            id: randomUUID(),
            reminderPolicyId: policy.id,
            offsetDays: r.offsetDays,
            emailTemplateId: r.emailTemplateId,
            minIntervalDays: r.minIntervalDays,
            createdAt: new Date(),
          }),
      );
      await this.ruleRepo.replaceForPolicy(policy.id, rules, manager);
    });

    return policy;
  }

  async update(
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
      const rules = input.rules.map(
        (r) =>
          new ReminderRule({
            id: randomUUID(),
            reminderPolicyId: id,
            offsetDays: r.offsetDays,
            emailTemplateId: r.emailTemplateId,
            minIntervalDays: r.minIntervalDays,
            createdAt: new Date(),
          }),
      );
      await this.ruleRepo.replaceForPolicy(id, rules, manager);
    });

    return updated;
  }

  async list(): Promise<ReminderPolicy[]> {
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
