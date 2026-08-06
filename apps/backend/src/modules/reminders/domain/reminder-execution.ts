export enum ReminderExecutionStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum ReminderSkipReason {
  ALREADY_PAID = 'ALREADY_PAID',
  DISPUTED = 'DISPUTED',
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface ReminderExecutionProps {
  id: string;
  organizationId: string;
  receivableId: string;
  reminderRuleId: string | null;
  executionDate: Date;
  sentAt: Date | null;
  status: ReminderExecutionStatus;
  skipReason: ReminderSkipReason | null;
  providerMessageId: string | null;
  failureReason: string | null;
  createdAt: Date;
  version: number;
}

export class ReminderExecution {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly reminderRuleId: string | null;
  readonly executionDate: Date;
  readonly sentAt: Date | null;
  readonly status: ReminderExecutionStatus;
  readonly skipReason: ReminderSkipReason | null;
  readonly providerMessageId: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly version: number;

  constructor(props: ReminderExecutionProps) {
    Object.assign(this, props);
  }
}
