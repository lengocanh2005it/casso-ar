import { ReminderScanCompletedListener } from './reminder-scan-completed.listener';

describe('ReminderScanCompletedListener', () => {
  it('passes the organization from the scan event to the escalation use case', async () => {
    const runEscalationScan = {
      scanOrganization: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new ReminderScanCompletedListener(
      runEscalationScan as any,
    );

    await listener.handle({
      organizationId: 'org-1',
      scanDate: '2026-08-09',
      queuedCount: 1,
      skippedCount: 0,
    });

    expect(runEscalationScan.scanOrganization).toHaveBeenCalledWith('org-1');
  });
});
