export type OperatorActionType =
  | 'ORGANIZATION_LOCKED'
  | 'ORGANIZATION_UNLOCKED'
  | 'MEMBER_BLOCKED'
  | 'MEMBER_UNBLOCKED';

export interface OperatorAuditLogProps {
  id: string;
  operatorId: string;
  organizationId: string;
  actionType: OperatorActionType;
  createdAt: Date;
  membershipId?: string | null;
}

export class OperatorAuditLog {
  readonly id: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly actionType: OperatorActionType;
  readonly createdAt: Date;
  readonly membershipId: string | null;

  constructor(props: OperatorAuditLogProps) {
    this.id = props.id;
    this.operatorId = props.operatorId;
    this.organizationId = props.organizationId;
    this.actionType = props.actionType;
    this.createdAt = props.createdAt;
    this.membershipId = props.membershipId ?? null;
  }
}
