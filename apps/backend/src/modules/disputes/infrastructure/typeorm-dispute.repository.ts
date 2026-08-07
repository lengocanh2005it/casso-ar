import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { In, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { type IDisputeRepository } from '../application/dispute-repository.port';
import { Dispute, DisputeStatus } from '../domain/dispute';
import { DisputeOrmEntity } from './dispute.orm-entity';

function toOrm(dispute: Dispute): DisputeOrmEntity {
  return {
    id: dispute.id,
    organizationId: dispute.organizationId,
    receivableId: dispute.receivableId,
    reason: dispute.reason,
    status: dispute.status,
    openedByUserId: dispute.openedByUserId,
    resolvedByUserId: dispute.resolvedByUserId,
    resolvedAt: dispute.resolvedAt,
    createdAt: dispute.createdAt,
    version: dispute.version,
  };
}

function toDomain(row: DisputeOrmEntity): Dispute {
  return new Dispute({
    id: row.id,
    organizationId: row.organizationId,
    receivableId: row.receivableId,
    reason: row.reason,
    status: row.status,
    openedByUserId: row.openedByUserId,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    version: row.version,
  });
}

@Injectable()
export class TypeOrmDisputeRepository
  extends BaseRepository<DisputeOrmEntity>
  implements IDisputeRepository
{
  constructor(
    @InjectRepository(DisputeOrmEntity)
    repo: Repository<DisputeOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Dispute | null> {
    const row = await this.scopedFindOne({ id });
    return row ? toDomain(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Dispute | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(DisputeOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? toDomain(row) : null;
  }

  async findOpenDispute(
    receivableId: string,
    manager?: EntityManager,
  ): Promise<Dispute | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repository = manager
      ? manager.getRepository(DisputeOrmEntity)
      : this.ormRepo;
    const row = await repository.findOne({
      where: {
        organizationId,
        receivableId,
        status: DisputeStatus.OPEN,
      },
    });
    return row ? toDomain(row) : null;
  }

  async findOpenDisputesByReceivableIds(
    receivableIds: string[],
  ): Promise<Map<string, string>> {
    if (receivableIds.length === 0) return new Map();
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: {
        organizationId,
        receivableId: In(receivableIds),
        status: DisputeStatus.OPEN,
      },
      select: { id: true, receivableId: true },
    });
    return new Map(rows.map((row) => [row.receivableId, row.id]));
  }

  async save(dispute: Dispute, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(dispute), manager);
  }
}
