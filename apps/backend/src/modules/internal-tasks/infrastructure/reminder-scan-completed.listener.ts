import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  REMINDER_SCAN_COMPLETED,
  type ReminderScanCompletedEvent,
} from '../../reminders/application/reminder-scheduler.service';
import { RunEscalationScanUseCase } from '../application/run-escalation-scan.usecase';

@Injectable()
export class ReminderScanCompletedListener {
  constructor(private readonly runEscalationScan: RunEscalationScanUseCase) {}

  @OnEvent(REMINDER_SCAN_COMPLETED)
  async handle(payload: ReminderScanCompletedEvent): Promise<void> {
    await this.runEscalationScan.scanOrganization(payload.organizationId);
  }
}
