export type OperatorActionType =
  | 'ORGANIZATION_LOCKED'
  | 'ORGANIZATION_UNLOCKED';

export interface OperatorAuditLogProps {
  id: string;
  operatorId: string;
  organizationId: string;
  actionType: OperatorActionType;
  createdAt: Date;
}

export class OperatorAuditLog {
  readonly id: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly actionType: OperatorActionType;
  readonly createdAt: Date;

  constructor(props: OperatorAuditLogProps) {
    this.id = props.id;
    this.operatorId = props.operatorId;
    this.organizationId = props.organizationId;
    this.actionType = props.actionType;
    this.createdAt = props.createdAt;
  }
}
