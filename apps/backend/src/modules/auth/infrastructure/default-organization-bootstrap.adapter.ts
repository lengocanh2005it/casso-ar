import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CustomerGroup } from '../../customers/domain/customer-group';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../email-templates/application/email-template-repository.port';
import { buildDefaultEmailTemplates } from '../../email-templates/application/seed-default-email-templates';
import type { IReminderPolicyRepository } from '../../reminders/application/reminder-policy-repository.port';
import type { IReminderRuleRepository } from '../../reminders/application/reminder-rule-repository.port';
import { ReminderPolicy } from '../../reminders/domain/reminder-policy';
import { ReminderRule } from '../../reminders/domain/reminder-rule';
import type { IOrganizationBootstrap } from '../application/organization-bootstrap.port';

@Injectable()
export class DefaultOrganizationBootstrap implements IOrganizationBootstrap {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject('IReminderPolicyRepository')
    private readonly policyRepo: IReminderPolicyRepository,
    @Inject('IReminderRuleRepository')
    private readonly ruleRepo: IReminderRuleRepository,
  ) {}

  async seed(organizationId: string, manager: EntityManager): Promise<void> {
    const now = new Date();

    const templates = buildDefaultEmailTemplates(organizationId, now);
    await this.templateRepo.saveMany(templates, manager);

    const templateList = templates.map((t) => ({ id: t.id, name: t.name }));
    const templateMap = new Map(templateList.map((t) => [t.name, t.id]));

    for (const customerGroup of [CustomerGroup.VIP, CustomerGroup.REGULAR]) {
      const policy = new ReminderPolicy({
        id: randomUUID(),
        organizationId,
        customerGroup,
        isActive: true,
        createdAt: now,
      });
      await this.policyRepo.save(policy, manager);

      const rules = [
        { name: 'Reminder 3 days before due date', offsetDays: -3 },
        { name: 'Reminder 1 day overdue', offsetDays: 1 },
        { name: 'Reminder 7 days overdue', offsetDays: 7 },
        { name: 'Reminder 30 days overdue', offsetDays: 30 },
      ].map(
        (r) =>
          new ReminderRule({
            id: randomUUID(),
            reminderPolicyId: policy.id,
            offsetDays: r.offsetDays,
            emailTemplateId: templateMap.get(r.name) ?? '',
            minIntervalDays: 7,
            createdAt: now,
          }),
      );
      await this.ruleRepo.replaceForPolicy(policy.id, rules, manager);
    }
  }
}
