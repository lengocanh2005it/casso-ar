export const ADMIN_MEMBER_STATUS_FILTERS = [
  'ALL',
  'ACTIVE',
  'BLOCKED',
  'PENDING',
] as const;

export type AdminMemberStatusFilter =
  (typeof ADMIN_MEMBER_STATUS_FILTERS)[number];
