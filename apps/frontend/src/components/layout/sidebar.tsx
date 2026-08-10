import { PlanId } from '@casso-ledger/shared-types';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import { hasPlanAccess } from '@/lib/plan-access';
import { cn } from '@/lib/utils';
import { navItems } from './nav-items';
import { SidebarFooter } from './sidebar-footer';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

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

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && (
          <span className="text-lg font-semibold">Casso Ledger</span>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 hover:bg-sidebar-accent"
            aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const badgeCount =
            item.to === '/exceptions' ? reviewCount : item.badgeCount;
          const locked =
            item.minPlan !== undefined &&
            !hasPlanAccess(currentPlan, item.minPlan);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-primary/5 hover:text-primary',
                  isActive &&
                    'bg-primary/10 font-medium text-primary ring-1 ring-primary/15',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && badgeCount !== undefined && (
                <Badge count={badgeCount} />
              )}
              {!collapsed && locked && (
                <Lock className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </NavLink>
          );
        })}
      </nav>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}
