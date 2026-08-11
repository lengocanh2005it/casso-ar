import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MobileSidebarWrapper } from './mobile-sidebar';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Đi tới nội dung
      </a>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <div className="hidden md:block">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <MobileSidebarWrapper />
            <span className="text-base font-semibold">Casso Ledger</span>
            <ThemeToggle className="ml-auto hover:bg-accent" />
          </header>

          <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
