import { randomUUID } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderRule } from '../domain/reminder-rule';

export interface ReminderRuleInput {
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
}

export interface SaveReminderPolicyInput {
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  rules: ReminderRuleInput[];
}

export function assertUniqueOffsetDays(rules: ReminderRuleInput[]): void {
  const offsetDays = rules.map((r) => r.offsetDays);
  if (new Set(offsetDays).size !== offsetDays.length) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Duplicate offsetDays values',
    );
  }
}

export function buildReminderRules(
  reminderPolicyId: string,
  rules: ReminderRuleInput[],
): ReminderRule[] {
  return rules.map(
    (r) =>
      new ReminderRule({
        id: randomUUID(),
        reminderPolicyId,
        offsetDays: r.offsetDays,
        emailTemplateId: r.emailTemplateId,
        minIntervalDays: r.minIntervalDays,
        createdAt: new Date(),
      }),
  );
}
