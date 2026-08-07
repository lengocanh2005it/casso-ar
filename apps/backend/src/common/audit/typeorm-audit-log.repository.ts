import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { AuditLog } from './audit-log';
import { AuditLogOrmEntity } from './audit-log.orm-entity';
import type { IAuditLogRepository } from './audit-log-repository.port';

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
}
