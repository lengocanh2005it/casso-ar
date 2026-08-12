import type { Role } from '../../../organizations/domain/membership';
import type { MembershipInvite } from '../../domain/membership-invite';

export interface InviteResponseDto {
  id: string;
  email: string;
  role: Role;
  invitedAt: Date;
  expiresAt: Date;
}

export function toInviteResponse(invite: MembershipInvite): InviteResponseDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}
