export enum CollectionActivityType {
  INVOICE_CREATED = 'INVOICE_CREATED',
  EMAIL_SENT = 'EMAIL_SENT',
  EMAIL_FAILED = 'EMAIL_FAILED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  RECEIVABLE_CLOSED = 'RECEIVABLE_CLOSED',
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  MANUAL_CALL = 'MANUAL_CALL',
  MANUAL_NOTE = 'MANUAL_NOTE',
  PAYMENT_COMMITMENT = 'PAYMENT_COMMITMENT',
}

export const MANUAL_ACTIVITY_TYPES = [
  CollectionActivityType.MANUAL_CALL,
  CollectionActivityType.MANUAL_NOTE,
  CollectionActivityType.PAYMENT_COMMITMENT,
] as const;

export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];

export interface CollectionActivityProps {
  id: string;
  organizationId: string;
  receivableId: string;
  customerId: string;
  activityType: CollectionActivityType;
  description: string;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export class CollectionActivity {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly customerId: string;
  readonly activityType: CollectionActivityType;
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;

  constructor(props: CollectionActivityProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.receivableId = props.receivableId;
    this.customerId = props.customerId;
    this.activityType = props.activityType;
    this.description = props.description;
    this.metadata = props.metadata;
    this.createdByUserId = props.createdByUserId;
    this.createdAt = props.createdAt;
  }
}
