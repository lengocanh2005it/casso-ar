import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReminderExecutionRecoveryService } from '../application/reminder-execution-recovery.service';

@Injectable()
export class ReminderExecutionRecoveryScheduler {
  constructor(
    private readonly recoveryService: ReminderExecutionRecoveryService,
  ) {}

  @Cron('*/1 * * * *')
  async recoverStalePending(): Promise<void> {
    await this.recoveryService.recoverStalePending();
  }
}
