export type { MembershipStatus } from '@casso-ledger/shared-types';
export { INVITABLE_ROLES, Role } from '@casso-ledger/shared-types';

import type { MembershipStatus, Role } from '@casso-ledger/shared-types';

export interface MembershipProps {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  invitedAt: Date;
  joinedAt: Date | null;
  createdAt: Date;
  status?: MembershipStatus;
  blockedAt?: Date | null;
}

export class Membership {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly invitedAt: Date;
  readonly joinedAt: Date | null;
  readonly createdAt: Date;
  readonly status: MembershipStatus;
  readonly blockedAt: Date | null;

  constructor(props: MembershipProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.role = props.role;
    this.invitedAt = props.invitedAt;
    this.joinedAt = props.joinedAt;
    this.createdAt = props.createdAt;
    this.status = props.status ?? 'ACTIVE';
    this.blockedAt = props.blockedAt ?? null;
  }

  isActive(): boolean {
    return this.joinedAt !== null;
  }

  isBlocked(): boolean {
    return this.status === 'BLOCKED';
  }

  withRole(role: Role): Membership {
    return new Membership({ ...this, role });
  }

  block(): Membership {
    return new Membership({
      ...this,
      status: 'BLOCKED',
      blockedAt: new Date(),
    });
  }

  unblock(): Membership {
    return new Membership({ ...this, status: 'ACTIVE', blockedAt: null });
  }
}
