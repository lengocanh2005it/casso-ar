import type { EntityManager } from 'typeorm';
import type { AuditLog } from './audit-log';

export interface IAuditLogRepository {
  create(log: AuditLog, manager?: EntityManager): Promise<void>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
