export enum Role {
  OWNER = 'OWNER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_REP = 'SALES_REP',
  VIEWER = 'VIEWER',
}

export interface MembershipProps {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  invitedAt: Date;
  joinedAt: Date | null;
  createdAt: Date;
}

export class Membership {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly invitedAt: Date;
  readonly joinedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: MembershipProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.role = props.role;
    this.invitedAt = props.invitedAt;
    this.joinedAt = props.joinedAt;
    this.createdAt = props.createdAt;
  }

  isActive(): boolean {
    return this.joinedAt !== null;
  }
}
