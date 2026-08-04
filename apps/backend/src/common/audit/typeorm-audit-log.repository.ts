import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuditLog } from './audit-log';
import type { IAuditLogRepository } from './audit-log-repository.port';

@Injectable()
export class TypeOrmAuditLogRepository implements IAuditLogRepository {
  async create(log: AuditLog, manager?: EntityManager): Promise<void> {
    if (manager) {
      await manager.query(
        `INSERT INTO audit_logs ("organizationId", "userId", "actionType", "entityType", "entityId", "beforeState", "afterState", "ipAddress", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          log.organizationId,
          log.userId,
          log.actionType,
          log.entityType,
          log.entityId,
          JSON.stringify(log.beforeState),
          JSON.stringify(log.afterState),
          log.ipAddress,
          log.createdAt,
        ],
      );
    }
  }
}
