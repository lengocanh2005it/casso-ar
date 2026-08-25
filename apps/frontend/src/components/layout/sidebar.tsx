import { PlanId } from '@casso-ar/shared-types';
import { useAuth } from '@/contexts/auth-context';
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import { hasPlanAccess } from '@/lib/plan-access';
import { hasPermission } from '@/lib/rbac';
import { navItems } from './nav-items';
import { SidebarFooter } from './sidebar-footer';
import { SidebarShell, type SidebarShellItem } from './sidebar-shell';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const { user } = useAuth();
  const { data: reviewCount = 0 } = useReviewCount();
  const currentPlan = user?.subscriptionPlan ?? PlanId.FREE;

  const items: SidebarShellItem[] = navItems
    .filter(
      (item) =>
        item.permission === undefined ||
        hasPermission(user?.role, item.permission),
    )
    .map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon,
      badgeCount: item.to === '/exceptions' ? reviewCount : item.badgeCount,
      locked:
        item.minPlan !== undefined && !hasPlanAccess(currentPlan, item.minPlan),
    }));

  return (
    <SidebarShell
      items={items}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      footer={<SidebarFooter collapsed={collapsed} />}
    />
  );
}
