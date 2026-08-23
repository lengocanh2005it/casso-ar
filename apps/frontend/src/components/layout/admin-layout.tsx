import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from '@/features/admin/components/admin-sidebar';
import { MobileSidebarWrapper } from './mobile-sidebar';
import { ThemeToggle } from './theme-toggle';

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <a
        href="#admin-main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-md"
      >
        Đi tới nội dung
      </a>
      <div className="flex h-dvh w-full overflow-hidden bg-app-canvas">
        <div className="hidden h-full md:block">
          <AdminSidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <MobileSidebarWrapper>
              <AdminSidebar />
            </MobileSidebarWrapper>
            <span
              className="text-base font-semibold text-primary"
              translate="no"
            >
              Casso Admin
            </span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle className="pointer-hover:hover:bg-accent" />
            </div>
          </header>

          <main
            id="admin-main-content"
            className="min-h-0 flex-1 overflow-auto bg-app-canvas p-4 md:p-6 xl:p-8"
          >
            <div className="mx-auto w-full min-h-full max-w-[1600px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
