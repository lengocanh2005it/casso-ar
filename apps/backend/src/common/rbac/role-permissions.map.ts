import { Role } from '../../modules/organizations/domain/membership';
import { Permission } from './permission.enum';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: Object.values(Permission),
  [Role.FINANCE_MANAGER]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.RECEIVABLE_WRITE_OFF,
    Permission.RECEIVABLE_DISPUTE,
    Permission.PAYMENT_ALLOCATE,
    Permission.PAYMENT_ALLOCATE_UNDO,
    Permission.SUBSCRIPTION_MANAGE,
    Permission.EMAIL_TEMPLATE_READ,
    Permission.REMINDER_POLICY_WRITE,
    Permission.REMINDER_SEND_MANUAL,
    Permission.USER_MANAGE,
    Permission.INTERNAL_TASK_MANAGE,
    Permission.REPORT_READ,
    Permission.AUDIT_LOG_READ,
    Permission.CUSTOMER_READ,
    Permission.ORGANIZATION_READ,
  ],
  [Role.ACCOUNTANT]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.RECEIVABLE_DISPUTE,
    Permission.PAYMENT_ALLOCATE,
    Permission.EMAIL_TEMPLATE_READ,
    Permission.REMINDER_SEND_MANUAL,
    Permission.INTERNAL_TASK_MANAGE,
    Permission.REPORT_READ,
    Permission.CUSTOMER_READ,
  ],
  [Role.SALES_REP]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.EMAIL_TEMPLATE_READ,
    Permission.REPORT_READ,
    Permission.CUSTOMER_READ,
  ],
  [Role.VIEWER]: [
    Permission.RECEIVABLE_READ,
    Permission.EMAIL_TEMPLATE_READ,
    Permission.REPORT_READ,
    Permission.AUDIT_LOG_READ,
    Permission.CUSTOMER_READ,
  ],
};
