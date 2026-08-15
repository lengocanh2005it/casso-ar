import { Permission, PlanId } from '@casso-ledger/shared-types';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Bot,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Users,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  minPlan?: PlanId;
  permission?: Permission;
  badgeCount?: number;
}

export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Khách hàng', icon: Users },
  { to: '/receivables', label: 'Công nợ', icon: FileText },
  { to: '/bank-connections', label: 'Kết nối ngân hàng', icon: Landmark },
  { to: '/exceptions', label: 'Xử lý ngoại lệ', icon: AlertTriangle },
  { to: '/reminders', label: 'Lịch nhắc', icon: BellRing },
  { to: '/copilot', label: 'Copilot', icon: Bot, minPlan: PlanId.STARTER },
  { to: '/reports', label: 'Báo cáo', icon: BarChart3 },
  {
    to: '/receivable-balance-history',
    label: 'Lịch sử công nợ',
    icon: History,
    permission: Permission.RECEIVABLE_AUDIT_READ,
  },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
];
