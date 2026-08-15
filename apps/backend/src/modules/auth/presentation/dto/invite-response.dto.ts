import type { Role } from '../../../organizations/domain/membership';
import type { PendingInviteSummary } from '../../domain/membership-invite';

export class InviteResponseDto {
  id: string;
  email: string;
  role: Role;
  invitedAt: Date;
  expiresAt: Date;
}

export class ListInvitesResponseDto {
  items: InviteResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toInviteResponse(
  invite: PendingInviteSummary,
): InviteResponseDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}
