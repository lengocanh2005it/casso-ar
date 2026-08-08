import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CustomerGroup } from '../../customers/domain/customer-group';
import type { IReminderPolicyRepository } from '../application/reminder-policy-repository.port';
import { ReminderPolicy } from '../domain/reminder-policy';
import { ReminderPolicyOrmEntity } from './reminder-policy.orm-entity';

function toOrm(policy: ReminderPolicy): ReminderPolicyOrmEntity {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    customerGroup: policy.customerGroup,
    isActive: policy.isActive,
    createdAt: policy.createdAt,
  };
}

function toDomain(row: ReminderPolicyOrmEntity): ReminderPolicy {
  return new ReminderPolicy({
    id: row.id,
    organizationId: row.organizationId,
    customerGroup: row.customerGroup,
    isActive: row.isActive,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class TypeOrmReminderPolicyRepository
  extends BaseRepository<ReminderPolicyOrmEntity>
  implements IReminderPolicyRepository
{
  constructor(
    @InjectRepository(ReminderPolicyOrmEntity)
    repo: Repository<ReminderPolicyOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<ReminderPolicy | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { id, organizationId },
    });
    return row ? toDomain(row) : null;
  }

  async findByCustomerGroup(
    customerGroup: CustomerGroup,
  ): Promise<ReminderPolicy | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { organizationId, customerGroup },
    });
    return row ? toDomain(row) : null;
  }

  async findAll(): Promise<ReminderPolicy[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({ where: { organizationId } });
    return rows.map(toDomain);
  }

  async findAllOrganizationIdsForScheduler(): Promise<string[]> {
    const rows = await this.ormRepo
      .createQueryBuilder('p')
      .select('DISTINCT p."organizationId"')
      .where('p."isActive" = :isActive', { isActive: true })
      .getRawMany();
    return rows.map((r: { organizationId: string }) => r.organizationId);
  }

  async save(policy: ReminderPolicy, manager?: EntityManager): Promise<void> {
    const repo = manager
      ? manager.getRepository(ReminderPolicyOrmEntity)
      : this.ormRepo;
    await repo.save(toOrm(policy));
  }
}
