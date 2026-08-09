import { CustomerGroup } from '../../customers/domain/customer-group';

export const DEFAULT_ESCALATION_THRESHOLD_DAYS = 30;

export interface ReminderPolicyProps {
  id: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  createdAt: Date;
}

export class ReminderPolicy {
  readonly id: string;
  readonly organizationId: string;
  readonly customerGroup: CustomerGroup;
  readonly isActive: boolean;
  readonly escalationThresholdDays: number;
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
    Object.assign(this, { ...props, escalationThresholdDays });
  }
}
