export type OperatorActionType =
  | 'ORGANIZATION_LOCKED'
  | 'ORGANIZATION_UNLOCKED'
  | 'ORGANIZATION_APPROVED'
  | 'ORGANIZATION_REJECTED'
  | 'MEMBER_BLOCKED'
  | 'MEMBER_UNBLOCKED'
  | 'INVITE_RESENT'
  | 'INVITE_REVOKED';

export type OrganizationVerificationMethod =
  | 'TAX_CODE_NAME_MATCH_ONLY'
  | 'BUSINESS_REGISTRATION_DOCUMENT'
  | 'PHONE_CALL'
  | 'OTHER';

export interface OperatorAuditLogProps {
  id: string;
  operatorId: string;
  organizationId: string;
  actionType: OperatorActionType;
  createdAt: Date;
  membershipId?: string | null;
  inviteId?: string | null;
  reason?: string | null;
  verificationMethod?: OrganizationVerificationMethod | null;
}

export class OperatorAuditLog {
  readonly id: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly actionType: OperatorActionType;
  readonly createdAt: Date;
  readonly membershipId: string | null;
  readonly inviteId: string | null;
  readonly reason: string | null;
  readonly verificationMethod: OrganizationVerificationMethod | null;

  constructor(props: OperatorAuditLogProps) {
    this.id = props.id;
    this.operatorId = props.operatorId;
    this.organizationId = props.organizationId;
    this.actionType = props.actionType;
    this.createdAt = props.createdAt;
    this.membershipId = props.membershipId ?? null;
    this.inviteId = props.inviteId ?? null;
    this.reason = props.reason ?? null;
    this.verificationMethod = props.verificationMethod ?? null;
  }
}
