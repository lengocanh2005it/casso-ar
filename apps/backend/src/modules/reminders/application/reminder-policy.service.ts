import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
  rules: ReminderRuleInput[];
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
      throw new Error('Reminder policy already exists for customer group');
    }

    const offsetDays = input.rules.map((r) => r.offsetDays);
    const uniqueOffsets = new Set(offsetDays);
    if (uniqueOffsets.size !== offsetDays.length) {
      throw new Error('Duplicate offsetDays values');
    }

    const policy = new ReminderPolicy({
      id: randomUUID(),
      organizationId,
      customerGroup: input.customerGroup,
      isActive: input.isActive,
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
    input: { isActive: boolean; rules: ReminderRuleInput[] },
  ): Promise<ReminderPolicy> {
    const policies = await this.policyRepo.findAll();
    const policy = policies.find((p) => p.id === id);
    if (!policy) {
      throw new Error('Reminder policy not found');
    }

    const offsetDays = input.rules.map((r) => r.offsetDays);
    const uniqueOffsets = new Set(offsetDays);
    if (uniqueOffsets.size !== offsetDays.length) {
      throw new Error('Duplicate offsetDays values');
    }

    const updated = new ReminderPolicy({
      ...policy,
      isActive: input.isActive,
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
    return this.policyRepo.findAll();
  }
}
