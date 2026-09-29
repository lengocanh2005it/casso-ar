import { Permission } from '@casso-ar/shared-types';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useAlertsStream } from '@/features/alerts/api/use-alerts-stream';
import { AlertBell } from '@/features/alerts/components/alert-bell';
import { hasPermission } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { MobileSidebarWrapper } from './mobile-sidebar';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();
  useAlertsStream(user?.role === 'OWNER');

  // Every page grows past the viewport by default (min-h-full) so main's
  // own overflow-auto scrolling keeps its bottom padding visible. Copilot
  // is the one route that wants an exact-fit shell instead — its internal
  // panels need a definite height to fill (see copilot-page.tsx), not a
  // page that grows with (or shrinks to) chat content.
  const fillsExactHeight = pathname.startsWith('/copilot');

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-md"
      >
        Đi tới nội dung
      </a>
      <div className="flex h-dvh w-full overflow-hidden bg-app-canvas">
        <div className="hidden h-full md:block">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <MobileSidebarWrapper />
            <span className="text-base font-semibold text-primary">
              Casso AR
            </span>
            <div className="ml-auto flex items-center gap-1">
              <AlertBell />
              <ThemeToggle className="pointer-hover:hover:bg-accent" />
            </div>
          </header>

          <main
            id="main-content"
            className="min-h-0 flex-1 overflow-auto bg-app-canvas p-4 md:p-6 xl:p-8"
          >
            <div
              className={cn(
                'mx-auto w-full max-w-[1600px]',
                fillsExactHeight ? 'h-full' : 'min-h-full',
              )}
            >
              {user && !user.bankingLinked && (
                <div
                  role="status"
                  className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  <div>
                    <p className="font-medium">
                      Tổ chức chưa có kết nối ngân hàng đang hoạt động.
                    </p>
                    <p>Tự động đồng bộ giao dịch hiện không khả dụng.</p>
                  </div>
                  {hasPermission(
                    user.role,
                    Permission.BANK_CONNECTION_MANAGE,
                  ) ? (
                    <Link
                      to="/bank-connections"
                      className="inline-flex min-h-10 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Quản lý kết nối ngân hàng
                    </Link>
                  ) : (
                    <p>
                      Liên hệ Owner hoặc Finance Manager để kết nối ngân hàng.
                    </p>
                  )}
                </div>
              )}
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
