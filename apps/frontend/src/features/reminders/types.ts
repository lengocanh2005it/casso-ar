export type CustomerGroup = 'VIP' | 'REGULAR';

export interface ReminderRule {
  id: string;
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
}

export interface ReminderPolicy {
  id: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays: number | null;
  rules: ReminderRule[];
  createdAt: string;
}

export type ReminderExecutionStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface ReminderExecution {
  id: string;
  receivableId: string;
  reminderRuleId: string | null;
  status: ReminderExecutionStatus;
  sentAt: string | null;
  skipReason: string | null;
  providerMessageId: string | null;
  invoiceNumber: string | null;
  customerName: string | null;
}

export interface ReminderRuleInput {
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
}

export interface CreateReminderPolicyInput {
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  rules: ReminderRuleInput[];
}

export interface UpdateReminderPolicyInput {
  customerGroup?: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  rules: ReminderRuleInput[];
}

export interface ReminderExecutionFilters {
  receivableId?: string;
  status?: ReminderExecutionStatus;
  page?: number;
  limit?: number;
}

export interface ReminderExecutionPage {
  items: ReminderExecution[];
  total: number;
}
