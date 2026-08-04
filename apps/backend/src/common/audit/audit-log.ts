export interface AuditLogProps {
  organizationId: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

export class AuditLog {
  readonly organizationId: string;
  readonly userId: string;
  readonly actionType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly beforeState: Record<string, unknown>;
  readonly afterState: Record<string, unknown>;
  readonly ipAddress: string | null;
  readonly createdAt: Date;

  constructor(props: AuditLogProps) {
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.actionType = props.actionType;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.beforeState = props.beforeState;
    this.afterState = props.afterState;
    this.ipAddress = props.ipAddress;
    this.createdAt = props.createdAt;
  }
}
