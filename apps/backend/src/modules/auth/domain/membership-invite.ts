import type { Role } from '../../organizations/domain/membership';

export interface MembershipInviteProps {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export class MembershipInvite {
  readonly id: string;
  readonly organizationId: string;
  readonly email: string;
  readonly role: Role;
  readonly invitedByUserId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: MembershipInviteProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.email = props.email;
    this.role = props.role;
    this.invitedByUserId = props.invitedByUserId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.acceptedAt = props.acceptedAt;
    this.createdAt = props.createdAt;
  }

  isValid(now: Date): boolean {
    return (
      this.acceptedAt === null && this.expiresAt.getTime() >= now.getTime()
    );
  }

  markAccepted(): MembershipInvite {
    return new MembershipInvite({ ...this, acceptedAt: new Date() });
  }
}
