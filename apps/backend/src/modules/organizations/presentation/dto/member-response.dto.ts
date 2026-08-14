import type { Membership } from '../../domain/membership';

export class MemberResponseDto {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: Date | null;
}

export class ListMembersResponseDto {
  items: MemberResponseDto[];
  total: number;
  page: number;
  limit: number;
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
