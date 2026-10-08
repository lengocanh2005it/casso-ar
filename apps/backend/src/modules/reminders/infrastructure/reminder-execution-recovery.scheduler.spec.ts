import type { ReminderExecutionRecoveryService } from '../application/reminder-execution-recovery.service';
import { ReminderExecutionRecoveryScheduler } from './reminder-execution-recovery.scheduler';

describe('ReminderExecutionRecoveryScheduler', () => {
  it('delegates the scheduled recovery tick to the application service', async () => {
    const recoveryService = { recoverStalePending: jest.fn() };
    const scheduler = new ReminderExecutionRecoveryScheduler(
      recoveryService as unknown as ReminderExecutionRecoveryService,
    );

    await scheduler.recoverStalePending();

    expect(recoveryService.recoverStalePending).toHaveBeenCalledTimes(1);
  });
});
