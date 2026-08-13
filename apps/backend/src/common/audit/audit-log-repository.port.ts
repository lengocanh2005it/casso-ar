import type { EntityManager } from 'typeorm';
import type { AuditActionType, AuditEntityType } from './audit.enums';
import type { AuditLog } from './audit-log';

export interface AuditLogPageQuery {
  organizationId: string;
  entityType?: AuditEntityType;
  actionType?: AuditActionType;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface IAuditLogRepository {
  create(log: AuditLog, manager?: EntityManager): Promise<void>;
  findPage(
    query: AuditLogPageQuery,
  ): Promise<{ items: AuditLog[]; total: number }>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
