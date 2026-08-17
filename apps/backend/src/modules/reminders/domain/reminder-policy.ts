import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { CustomerGroup } from '../../customers/domain/customer-group';
import type { ReminderRule } from './reminder-rule';

export const DEFAULT_ESCALATION_THRESHOLD_DAYS = 30;

export interface ReminderPolicyProps {
  id: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  rules?: readonly ReminderRule[];
  createdAt: Date;
}

export class ReminderPolicy {
  readonly id: string;
  readonly organizationId: string;
  readonly customerGroup: CustomerGroup;
  readonly isActive: boolean;
  readonly escalationThresholdDays: number;
  readonly rules: readonly ReminderRule[];
  readonly createdAt: Date;

  constructor(props: ReminderPolicyProps) {
    if (!Object.values(CustomerGroup).includes(props.customerGroup)) {
      throw new Error(`Invalid customer group: ${props.customerGroup}`);
    }
    const escalationThresholdDays =
      props.escalationThresholdDays ?? DEFAULT_ESCALATION_THRESHOLD_DAYS;
    if (
      !Number.isInteger(escalationThresholdDays) ||
      escalationThresholdDays <= 0
    ) {
      throw new Error('escalationThresholdDays must be a positive integer');
    }
    Object.assign(this, {
      ...props,
      escalationThresholdDays,
      rules: props.rules ?? [],
    });
  }
}

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
