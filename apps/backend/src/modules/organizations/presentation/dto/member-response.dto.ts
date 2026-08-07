import type { Membership } from '../../domain/membership';

export interface MemberResponseDto {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: Date | null;
}

export function toMemberResponse(
  membership: Membership,
  user: { email: string; name: string },
): MemberResponseDto {
  return {
    id: membership.id,
    userId: membership.userId,
    email: user.email,
    name: user.name,
    role: membership.role,
    joinedAt: membership.joinedAt,
  };
}
