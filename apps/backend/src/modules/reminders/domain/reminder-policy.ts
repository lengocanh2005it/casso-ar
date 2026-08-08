import { CustomerGroup } from '../../customers/domain/customer-group';

export interface ReminderPolicyProps {
  id: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  createdAt: Date;
}

export class ReminderPolicy {
  readonly id: string;
  readonly organizationId: string;
  readonly customerGroup: CustomerGroup;
  readonly isActive: boolean;
  readonly createdAt: Date;

  constructor(props: ReminderPolicyProps) {
    if (!Object.values(CustomerGroup).includes(props.customerGroup)) {
      throw new Error(`Invalid customer group: ${props.customerGroup}`);
    }
    Object.assign(this, props);
  }
}
