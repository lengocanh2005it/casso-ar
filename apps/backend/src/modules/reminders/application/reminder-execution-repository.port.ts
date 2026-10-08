import type { EntityManager } from 'typeorm';
import type {
  ReminderExecution,
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';

export interface IReminderExecutionRepository {
  getStatus(id: string): Promise<ReminderExecutionStatus | null>;
  findLatestSentByReceivableIds(
    receivableIds: string[],
  ): Promise<Map<string, { sentAt: Date }>>;
  findByKey(
    receivableId: string,
    reminderRuleId: string | null,
    executionDate: Date,
  ): Promise<{ id: string; status: ReminderExecutionStatus } | null>;
  findById(id: string): Promise<ReminderExecution | null>;
  findPendingAutomatedBefore(
    createdBefore: Date,
    limit: number,
  ): Promise<ReminderExecution[]>;
  insertIfAbsent(execution: ReminderExecution): Promise<boolean>;
  save(execution: ReminderExecution, manager?: EntityManager): Promise<void>;
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
    failureReason?: string,
  ): Promise<void>;
  markSkippedIfPending(
    id: string,
    skipReason: ReminderSkipReason,
  ): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
