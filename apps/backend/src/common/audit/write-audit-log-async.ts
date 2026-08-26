import type { JsonLogger } from '../observability/json-logger.service';
import type { AuditLog } from './audit-log';
import type { IAuditLogRepository } from './audit-log-repository.port';

// A failed audit write must never block the business operation it records,
// so the repository call is fire-and-forget and failures are logged, not thrown.
export function writeAuditLogAsync(
  auditLogRepo: IAuditLogRepository,
  logger: JsonLogger,
  log: AuditLog,
): void {
  void auditLogRepo.create(log).catch((error: unknown) => {
    logger.error({
      message: 'Failed to write audit log',
      actionType: log.actionType,
      entityId: log.entityId,
      organizationId: log.organizationId,
      userId: log.userId,
      error,
    });
  });
}
