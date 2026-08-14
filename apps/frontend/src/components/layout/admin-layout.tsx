import { NavLink, Outlet } from 'react-router-dom';
import { AdminStatusRail } from '@/features/admin/components/admin-status-rail';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `touch-manipulation rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-hover:hover:bg-accent pointer-hover:hover:text-accent-foreground ${isActive ? 'font-medium text-primary' : 'text-muted-foreground'}`;
}

export function AdminLayout() {
  return (
    <>
      <a
        href="#admin-main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-md"
      >
        Đi tới nội dung
      </a>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
        <AdminStatusRail />
        <nav
          aria-label="Admin navigation"
          className="flex flex-wrap gap-2 border-b border-border px-4 py-2 text-sm"
        >
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
        <main
          id="admin-main-content"
          className="flex-1 overflow-auto p-4 md:p-6"
        >
          <Outlet />
        </main>
      </div>
    </>
  );
}
