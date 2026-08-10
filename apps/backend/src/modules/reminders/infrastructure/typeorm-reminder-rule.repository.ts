import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReminderRuleRepository } from '../application/reminder-rule-repository.port';
import { ReminderRule } from '../domain/reminder-rule';
import { ReminderPolicyOrmEntity } from './reminder-policy.orm-entity';
import { ReminderRuleOrmEntity } from './reminder-rule.orm-entity';

function toOrm(rule: ReminderRule): ReminderRuleOrmEntity {
  return {
    id: rule.id,
    reminderPolicyId: rule.reminderPolicyId,
    offsetDays: rule.offsetDays,
    emailTemplateId: rule.emailTemplateId,
    minIntervalDays: rule.minIntervalDays,
    createdAt: rule.createdAt,
  };
}

function toDomain(row: ReminderRuleOrmEntity): ReminderRule {
  return new ReminderRule({
    id: row.id,
    reminderPolicyId: row.reminderPolicyId,
    offsetDays: row.offsetDays,
    emailTemplateId: row.emailTemplateId,
    minIntervalDays: row.minIntervalDays,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class TypeOrmReminderRuleRepository implements IReminderRuleRepository {
  constructor(
    @InjectRepository(ReminderRuleOrmEntity)
    private readonly repo: Repository<ReminderRuleOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<ReminderRule | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.repo
      .createQueryBuilder('r')
      .innerJoin(
        ReminderPolicyOrmEntity,
        'p',
        'p.id::text = r."reminderPolicyId" AND p."organizationId" = :organizationId',
        { organizationId },
      )
      .where('r.id = :id', { id })
      .getOne();
    return row ? toDomain(row) : null;
  }

  async findByPolicyId(policyId: string): Promise<ReminderRule[]> {
    const rows = await this.repo.find({
      where: { reminderPolicyId: policyId },
    });
    return rows.map(toDomain);
  }

  async findByPolicyIds(policyIds: string[]): Promise<ReminderRule[]> {
    if (policyIds.length === 0) return [];
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.repo
      .createQueryBuilder('r')
      .innerJoin(
        ReminderPolicyOrmEntity,
        'p',
        'p.id::text = r."reminderPolicyId" AND p."organizationId" = :organizationId',
        { organizationId },
      )
      .where('r."reminderPolicyId" IN (:...policyIds)', { policyIds })
      .getMany();
    return rows.map(toDomain);
  }

  async replaceForPolicy(
    policyId: string,
    rules: ReminderRule[],
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(ReminderRuleOrmEntity);
    await repo.delete({ reminderPolicyId: policyId });
    if (rules.length > 0) {
      await repo.save(rules.map(toOrm));
    }
  }
}
