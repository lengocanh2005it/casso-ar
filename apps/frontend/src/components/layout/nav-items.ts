import {
  AlertTriangle,
  ArrowLeftRight,
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
  locked?: boolean;
  badgeCount?: number;
}

export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Khách hàng', icon: Users },
  { to: '/receivables', label: 'Công nợ', icon: FileText },
  { to: '/bank-connections', label: 'Kết nối ngân hàng', icon: Landmark },
  { to: '/transactions', label: 'Giao dịch / Đối soát', icon: ArrowLeftRight },
  { to: '/exceptions', label: 'Exception Queue', icon: AlertTriangle },
  { to: '/reminders', label: 'Lịch nhắc', icon: BellRing },
  { to: '/copilot', label: 'Copilot', icon: Bot, locked: true },
  { to: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
];
