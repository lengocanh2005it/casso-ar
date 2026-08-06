import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { AuditLog } from './audit-log';
import { AuditLogOrmEntity } from './audit-log.orm-entity';
import type { IAuditLogRepository } from './audit-log-repository.port';

interface AuditLogRow {
  id: string;
  organizationId: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

function toOrm(log: AuditLog): AuditLogRow {
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
    await executor.query(
      `INSERT INTO audit_logs
       ("id", "organizationId", "userId", "actionType", "entityType", "entityId", "beforeState", "afterState", "ipAddress", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        row.id,
        row.organizationId,
        row.userId,
        row.actionType,
        row.entityType,
        row.entityId,
        row.beforeState,
        row.afterState,
        row.ipAddress,
        row.createdAt,
      ],
    );
  }
}
