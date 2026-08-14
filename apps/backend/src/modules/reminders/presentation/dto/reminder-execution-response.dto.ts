import type {
  ReminderExecution,
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../../domain/reminder-execution';

export class ReminderExecutionResponseDto {
  id: string;
  receivableId: string;
  reminderRuleId: string | null;
  executionDate: Date;
  sentAt: Date | null;
  status: ReminderExecutionStatus;
  skipReason: ReminderSkipReason | null;
  providerMessageId: string | null;
  failureReason: string | null;
  createdAt: Date;
}

export class ListReminderExecutionsResponseDto {
  items: ReminderExecutionResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toReminderExecutionResponse(
  execution: ReminderExecution,
): ReminderExecutionResponseDto {
  return {
    id: execution.id,
    receivableId: execution.receivableId,
    reminderRuleId: execution.reminderRuleId,
    executionDate: execution.executionDate,
    sentAt: execution.sentAt,
    status: execution.status,
    skipReason: execution.skipReason,
    providerMessageId: execution.providerMessageId,
    failureReason: execution.failureReason,
    createdAt: execution.createdAt,
  };
}
