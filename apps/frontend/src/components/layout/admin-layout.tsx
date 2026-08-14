import { NavLink, Outlet } from 'react-router-dom';
import { AdminStatusRail } from '@/features/admin/components/admin-status-rail';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-medium text-primary' : 'text-muted-foreground';
}

export function AdminLayout() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AdminStatusRail />
      <nav className="flex gap-4 border-b border-border px-4 py-2 text-sm">
        <NavLink to="/admin/dashboard" className={navLinkClassName}>
          Dashboard
        </NavLink>
        <NavLink to="/admin/organizations" className={navLinkClassName}>
          Organizations
        </NavLink>
        <NavLink to="/admin/ai-usage" className={navLinkClassName}>
          AI Usage
        </NavLink>
      </nav>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
