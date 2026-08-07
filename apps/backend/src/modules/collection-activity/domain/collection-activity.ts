import {
  CollectionActivityType,
  MANUAL_ACTIVITY_TYPES,
  type ManualActivityType,
} from '../common/collection-activity-types';

export {
  CollectionActivityType,
  MANUAL_ACTIVITY_TYPES,
  type ManualActivityType,
};

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
