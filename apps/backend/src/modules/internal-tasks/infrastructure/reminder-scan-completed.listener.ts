import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RunEscalationScanUseCase } from '../application/run-escalation-scan.usecase';

export interface ReminderScanCompletedPayload {
  organizationId: string;
  scanDate: string;
}

@Injectable()
export class ReminderScanCompletedListener {
  constructor(private readonly runEscalationScan: RunEscalationScanUseCase) {}

  @OnEvent('reminder.scan.completed')
  async handle(payload: ReminderScanCompletedPayload): Promise<void> {
    await this.runEscalationScan.scanOrganization(payload.organizationId);
  }
}
