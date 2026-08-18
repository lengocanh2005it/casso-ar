import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useAlertsStream } from '@/features/alerts/api/use-alerts-stream';
import { AlertBell } from '@/features/alerts/components/alert-bell';
import { MobileSidebarWrapper } from './mobile-sidebar';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  useAlertsStream(user?.role === 'OWNER');

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-md"
      >
        Đi tới nội dung
      </a>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <div className="hidden h-full md:block">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <MobileSidebarWrapper />
            <span className="text-base font-semibold">Casso Ledger</span>
            <div className="ml-auto flex items-center gap-1">
              <AlertBell />
              <ThemeToggle className="pointer-hover:hover:bg-accent" />
            </div>
          </header>

          <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
