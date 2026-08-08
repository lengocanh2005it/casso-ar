import type {
  ReminderExecution,
  ReminderExecutionStatus,
} from '../domain/reminder-execution';

export interface IReminderExecutionRepository {
  getStatus(id: string): Promise<ReminderExecutionStatus | null>;
  findLatestSent(receivableId: string): Promise<{ sentAt: Date } | null>;
  findByKey(
    receivableId: string,
    reminderRuleId: string | null,
    executionDate: Date,
  ): Promise<{ id: string; status: ReminderExecutionStatus } | null>;
  findById(id: string): Promise<ReminderExecution | null>;
  insertIfAbsent(execution: ReminderExecution): Promise<boolean>;
  findPage(input: {
    receivableId?: string;
    status?: ReminderExecutionStatus;
    page: number;
    limit: number;
  }): Promise<{ items: ReminderExecution[]; total: number }>;
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
}
