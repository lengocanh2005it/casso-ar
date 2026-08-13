import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  type EntityManager,
  type FindOptionsWhere,
  LessThan,
  type Repository,
} from 'typeorm';
import { AuditLog } from './audit-log';
import { AuditLogOrmEntity } from './audit-log.orm-entity';
import type {
  AuditLogPageQuery,
  IAuditLogRepository,
} from './audit-log-repository.port';

function toOrm(log: AuditLog): AuditLogOrmEntity {
  return {
    id: log.id,
    organizationId: log.organizationId,
    userId: log.userId,
    actionType: log.actionType,
    entityType: log.entityType,
    entityId: log.entityId,
    beforeState: log.beforeState,
    afterState: log.afterState,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}

function toDomain(row: AuditLogOrmEntity): AuditLog {
  return new AuditLog({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeState: row.beforeState,
    afterState: row.afterState,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  });
}

const AUDIT_LOG_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  actionType: true,
  entityType: true,
  entityId: true,
  beforeState: true,
  afterState: true,
  ipAddress: true,
  createdAt: true,
} as const;

const MIN_DATE = new Date(0);
const MAX_DATE = new Date(8640000000000000);

@Injectable()
export class TypeOrmAuditLogRepository implements IAuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repo: Repository<AuditLogOrmEntity>,
  ) {}

  async create(log: AuditLog, manager?: EntityManager): Promise<void> {
    const row = toOrm(log);
    const executor = manager ?? this.repo.manager;
    await executor.save(AuditLogOrmEntity, row);
  }

  async findPage(
    query: AuditLogPageQuery,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const where: FindOptionsWhere<AuditLogOrmEntity> = {
      organizationId: query.organizationId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
      ...(query.actorUserId ? { userId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: Between(query.from ?? MIN_DATE, query.to ?? MAX_DATE),
          }
        : {}),
    };

    const [rows, total] = await this.repo.findAndCount({
      select: AUDIT_LOG_SELECT,
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items: rows.map(toDomain), total };
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
}
