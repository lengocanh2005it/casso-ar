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
  declare readonly id: string;
  declare readonly organizationId: string;
  declare readonly email: string;
  declare readonly role: Role;
  declare readonly invitedByUserId: string;
  declare readonly tokenHash: string;
  declare readonly expiresAt: Date;
  declare readonly acceptedAt: Date | null;
  declare readonly createdAt: Date;

  constructor(props: MembershipInviteProps) {
    Object.assign(this, props);
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
