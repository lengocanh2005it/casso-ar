import type { EntityManager } from 'typeorm';
import type { OperatorAuditLog } from '../domain/operator-audit-log';

export interface IOperatorAuditLogRepository {
  save(log: OperatorAuditLog, manager?: EntityManager): Promise<void>;
}

export const OPERATOR_AUDIT_LOG_REPOSITORY = Symbol(
  'OPERATOR_AUDIT_LOG_REPOSITORY',
);
