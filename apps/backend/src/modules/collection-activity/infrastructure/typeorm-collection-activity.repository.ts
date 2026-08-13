import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { LessThan, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type CollectionActivityPage,
  type ICollectionActivityRepository,
} from '../application/collection-activity-repository.port';
import { CollectionActivity } from '../domain/collection-activity';
import { CollectionActivityOrmEntity } from './collection-activity.orm-entity';

function toOrm(activity: CollectionActivity): CollectionActivityOrmEntity {
  return {
    id: activity.id,
    organizationId: activity.organizationId,
    receivableId: activity.receivableId,
    customerId: activity.customerId,
    activityType: activity.activityType,
    description: activity.description,
    metadata: activity.metadata,
    createdByUserId: activity.createdByUserId,
    createdAt: activity.createdAt,
  };
}

function toDomain(row: CollectionActivityOrmEntity): CollectionActivity {
  return new CollectionActivity({
    id: row.id,
    organizationId: row.organizationId,
    receivableId: row.receivableId,
    customerId: row.customerId,
    activityType: row.activityType,
    description: row.description,
    metadata: row.metadata,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class TypeOrmCollectionActivityRepository
  extends BaseRepository<CollectionActivityOrmEntity>
  implements ICollectionActivityRepository
{
  constructor(
    @InjectRepository(CollectionActivityOrmEntity)
    repo: Repository<CollectionActivityOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(
    activity: CollectionActivity,
    manager?: EntityManager,
  ): Promise<void> {
    // ponytail: TypeORM's insert() types Record<string, unknown> columns too
    // strictly for a jsonb field (see QueryDeepPartialEntity); the type-level
    // cast below only satisfies that generic, the toOrm() mapper above still
    // does the real domain -> ORM translation.
    const repo = manager
      ? manager.getRepository(CollectionActivityOrmEntity)
      : this.ormRepo;
    await repo.insert(
      toOrm(activity) as QueryDeepPartialEntity<CollectionActivityOrmEntity>,
    );
  }

  async findByReceivableId(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const [rows, total] = await this.ormRepo.findAndCount({
      where: { receivableId, organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(toDomain), total };
  }

  async findByCustomerId(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const [rows, total] = await this.ormRepo.findAndCount({
      where: { customerId, organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(toDomain), total };
  }

  async findByOrganizationId(
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const [rows, total] = await this.ormRepo.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(toDomain), total };
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.ormRepo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
}
