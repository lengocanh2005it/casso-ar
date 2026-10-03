import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

export interface SidebarShellItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  locked?: boolean;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface SidebarShellProps {
  items: SidebarShellItem[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  footer?: ReactNode;
  navLabel?: string;
  activePath?: string;
  widthClassName?: string;
  className?: string;
}

export function SidebarShell({
  items,
  collapsed = false,
  onToggleCollapsed,
  footer,
  navLabel = 'Điều hướng chính',
  activePath,
  widthClassName,
  className,
}: SidebarShellProps) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out motion-reduce:transition-none',
        collapsed ? 'w-16' : (widthClassName ?? 'w-64'),
        className,
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 px-4 py-4">
          <Logo variant="icon" className="h-7 w-7" />
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded-md p-1.5 transition-[background-color,transform] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 pointer-hover:hover:bg-sidebar-accent active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label="Mở rộng sidebar"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-4">
          <Logo className="h-7" wordmarkClassName="text-primary" />
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded-md p-1.5 transition-[background-color,transform] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 pointer-hover:hover:bg-sidebar-accent active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label="Thu gọn sidebar"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      )}

      <nav aria-label={navLabel} className="flex-1 space-y-1 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-primary/5 pointer-hover:hover:text-primary',
                  (activePath ? activePath === item.to : isActive) &&
                    'bg-primary/10 font-medium text-primary ring-1 ring-primary/15',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {!collapsed && (
                <span className="min-w-0 truncate">{item.label}</span>
              )}
              {!collapsed && item.badgeCount !== undefined && (
                <Badge count={item.badgeCount} />
              )}
              {!collapsed && item.locked && (
                <Lock
                  aria-hidden="true"
                  className="ml-auto size-3.5 text-muted-foreground"
                />
              )}
            </NavLink>
          );
        })}
      </nav>

      {footer}
    </aside>
  );
}
