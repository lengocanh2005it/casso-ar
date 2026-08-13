import { AlertType } from '../domain/alert';
import { ReminderScanAlertListener } from './reminder-scan-alert.listener';

function buildDeps() {
  return {
    membershipRepo: {
      findOwnerByOrganization: jest
        .fn()
        .mockResolvedValue({ userId: 'owner-1' }),
    },
    createAlert: { execute: jest.fn().mockResolvedValue(undefined) },
    tenantContext: { run: (_user: unknown, cb: () => unknown) => cb() },
  };
}

describe('ReminderScanAlertListener', () => {
  it('creates a REMINDER_SCAN_SUMMARY alert when queuedCount > 0', async () => {
    const deps = buildDeps();
    const listener = new ReminderScanAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      organizationId: 'org-1',
      scanDate: '2026-08-13',
      queuedCount: 3,
      skippedCount: 1,
    });

    expect(deps.createAlert.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      type: AlertType.REMINDER_SCAN_SUMMARY,
      entityType: 'reminder_scan',
      entityId: 'org-1',
    });
  });

  it('does not create an alert when queuedCount is 0', async () => {
    const deps = buildDeps();
    const listener = new ReminderScanAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      organizationId: 'org-1',
      scanDate: '2026-08-13',
      queuedCount: 0,
      skippedCount: 0,
    });

    expect(deps.createAlert.execute).not.toHaveBeenCalled();
  });
});
