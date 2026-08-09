import { PlanId } from '@casso-ledger/shared-types';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Bot,
  FileText,
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
  badgeCount?: number;
}

export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Khách hàng', icon: Users },
  { to: '/receivables', label: 'Công nợ', icon: FileText },
  { to: '/bank-connections', label: 'Kết nối ngân hàng', icon: Landmark },
  { to: '/exceptions', label: 'Exception Queue', icon: AlertTriangle },
  { to: '/reminders', label: 'Lịch nhắc', icon: BellRing },
  { to: '/copilot', label: 'Copilot', icon: Bot, minPlan: PlanId.BUSINESS },
  { to: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
];
