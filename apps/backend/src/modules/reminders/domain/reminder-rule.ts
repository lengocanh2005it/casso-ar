export interface ReminderRuleProps {
  id: string;
  reminderPolicyId: string;
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
  createdAt: Date;
}

export class ReminderRule {
  readonly id: string;
  readonly reminderPolicyId: string;
  readonly offsetDays: number;
  readonly emailTemplateId: string;
  readonly minIntervalDays: number;
  readonly createdAt: Date;

  constructor(props: ReminderRuleProps) {
    if (!Number.isInteger(props.offsetDays)) {
      throw new Error('offsetDays must be an integer');
    }
    if (!Number.isInteger(props.minIntervalDays) || props.minIntervalDays < 0) {
      throw new Error('minIntervalDays must be non-negative');
    }
    Object.assign(this, props);
  }
}
