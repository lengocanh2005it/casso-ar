import type { OrganizationMember } from '@/features/settings/types';

export function actorLabel(
  userId: string,
  members: OrganizationMember[],
): string {
  return (
    members.find((member) => member.userId === userId)?.name ??
    'Người dùng đã rời tổ chức'
  );
}
