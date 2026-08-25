import { Role } from '@casso-ar/shared-types';

export const ROLE_LABELS: Record<Role, string> = {
  [Role.OWNER]: 'Chủ sở hữu',
  [Role.FINANCE_MANAGER]: 'Quản lý tài chính',
  [Role.ACCOUNTANT]: 'Kế toán',
  [Role.SALES_REP]: 'Nhân viên kinh doanh',
  [Role.VIEWER]: 'Người xem',
};
