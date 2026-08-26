import { AuditActionType, AuditEntityType } from './audit.enums';
import { AuditLog } from './audit-log';
import { writeAuditLogAsync } from './write-audit-log-async';

function buildLog(): AuditLog {
  return new AuditLog({
    organizationId: 'org-1',
    userId: 'user-1',
    actionType: AuditActionType.WEBHOOK_REPROCESS,
    entityType: AuditEntityType.WEBHOOK_INBOX,
    entityId: 'inbox-1',
    beforeState: null,
    afterState: null,
    ipAddress: null,
    createdAt: new Date(),
  });
}

describe('writeAuditLogAsync', () => {
  it('writes the log without awaiting the repository call', () => {
    const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };
    const logger = { error: jest.fn() };
    const log = buildLog();

    writeAuditLogAsync(auditLogRepo as never, logger as never, log);

    expect(auditLogRepo.create).toHaveBeenCalledWith(log);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs the failure instead of throwing when the repository rejects', async () => {
    const error = new Error('db unavailable');
    const auditLogRepo = { create: jest.fn().mockRejectedValue(error) };
    const logger = { error: jest.fn() };
    const log = buildLog();

    writeAuditLogAsync(auditLogRepo as never, logger as never, log);
    await Promise.resolve().then(() => Promise.resolve());

    expect(logger.error).toHaveBeenCalledWith({
      message: 'Failed to write audit log',
      actionType: log.actionType,
      entityId: log.entityId,
      organizationId: log.organizationId,
      userId: log.userId,
      error,
    });
  });
});
