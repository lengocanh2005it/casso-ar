import { BarChart3, Building2, LayoutDashboard } from 'lucide-react';
import {
  SidebarShell,
  type SidebarShellItem,
} from '@/components/layout/sidebar-shell';
import { AdminSidebarFooter } from './admin-sidebar-footer';

const ADMIN_NAV_ITEMS: SidebarShellItem[] = [
  { to: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/admin/organizations', label: 'Tổ chức', icon: Building2 },
  { to: '/admin/ai-usage', label: 'Sử dụng AI', icon: BarChart3 },
];

interface AdminSidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function AdminSidebar({
  collapsed = false,
  onToggleCollapsed,
}: AdminSidebarProps) {
  return (
    <SidebarShell
      items={ADMIN_NAV_ITEMS}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      footer={<AdminSidebarFooter collapsed={collapsed} />}
    />
  );
}
