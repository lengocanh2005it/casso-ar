import type { ReminderExecutionStatus } from '../domain/reminder-execution';

export interface IReminderExecutionRepository {
  getStatus(id: string): Promise<ReminderExecutionStatus | null>;
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
}

export const REMINDER_EXECUTION_REPOSITORY = Symbol(
  'REMINDER_EXECUTION_REPOSITORY',
);
