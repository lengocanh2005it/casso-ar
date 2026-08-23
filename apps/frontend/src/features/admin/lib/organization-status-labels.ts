import type { OrganizationListItem } from '../api/admin-api';

export const ORGANIZATION_STATUS_LABELS: Record<
  OrganizationListItem['status'],
  string
> = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
  PENDING_REVIEW: 'Chờ duyệt',
  REJECTED: 'Đã từ chối',
};
