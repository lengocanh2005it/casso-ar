import type { CustomerGroup } from '../../../customers/domain/customer-group';
import type { ReminderPolicy } from '../../domain/reminder-policy';

export class ReminderRuleResponseDto {
  id: string;
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
  createdAt: Date;
}

export class ReminderPolicyResponseDto {
  id: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays: number;
  rules: ReminderRuleResponseDto[];
  createdAt: Date;
}

export function toReminderPolicyResponse(
  policy: ReminderPolicy,
): ReminderPolicyResponseDto {
  return {
    id: policy.id,
    customerGroup: policy.customerGroup,
    isActive: policy.isActive,
    escalationThresholdDays: policy.escalationThresholdDays,
    rules: policy.rules.map((rule) => ({
      id: rule.id,
      offsetDays: rule.offsetDays,
      emailTemplateId: rule.emailTemplateId,
      minIntervalDays: rule.minIntervalDays,
      createdAt: rule.createdAt,
    })),
    createdAt: policy.createdAt,
  };
}
