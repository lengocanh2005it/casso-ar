import { AuditActionType, AuditEntityType } from './audit.enums';
import { AuditLog } from './audit-log';

describe('AuditLog', () => {
  function baseProps() {
    return {
      organizationId: 'org-1',
      userId: 'user-1',
      actionType: AuditActionType.RECEIVABLE_CREATE,
      entityType: AuditEntityType.RECEIVABLE,
      entityId: 'rec-1',
      beforeState: null,
      afterState: null,
      ipAddress: null,
      createdAt: new Date('2026-08-26'),
    };
  }

  it('defaults relatedReceivableId to null when omitted', () => {
    const log = new AuditLog(baseProps());

    expect(log.relatedReceivableId).toBeNull();
  });

  it('keeps an explicit relatedReceivableId', () => {
    const log = new AuditLog({ ...baseProps(), relatedReceivableId: 'rec-9' });

    expect(log.relatedReceivableId).toBe('rec-9');
  });
});
