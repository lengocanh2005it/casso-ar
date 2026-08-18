import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/app-layout';
import { MemberBlockedWatcher } from '@/contexts/member-blocked-watcher';
import { useTheme } from '@/contexts/theme-context';
import {
  UpgradeDialog,
  usePlanLimitDialog,
} from '@/features/settings/components/upgrade-dialog';
import {
  adminRoutes,
  appRoutes,
  authRoutes,
  OnboardingPage,
  withPageSuspense,
} from '@/routes';
import { OnboardingRoute, ProtectedRoute } from '@/routes/protected-route';

function renderRoute(route: RouteObject, routeKey: string): ReactElement {
  if (route.index) {
    return <Route key={routeKey} index element={route.element} />;
  }

  return (
    <Route key={routeKey} path={route.path} element={route.element}>
      {route.children?.map((child, index) =>
        renderRoute(child, `${routeKey}-${index}`),
      )}
    </Route>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {authRoutes.map((route, index) => renderRoute(route, `auth-${index}`))}
      {adminRoutes.map((route, index) => renderRoute(route, `admin-${index}`))}
      <Route
        path="onboarding"
        element={
          <ProtectedRoute>
            {withPageSuspense(<OnboardingPage />)}
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <OnboardingRoute>
              <AppLayout />
            </OnboardingRoute>
          </ProtectedRoute>
        }
      >
        {appRoutes.map((route, index) => renderRoute(route, `app-${index}`))}
      </Route>
    </Routes>
  );
}

export function App() {
  const planLimitDialog = usePlanLimitDialog();
  const { resolvedTheme } = useTheme();

  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" theme={resolvedTheme} />
      <AppRoutes />
      <MemberBlockedWatcher />
      <UpgradeDialog
        open={planLimitDialog.open}
        onOpenChange={planLimitDialog.setOpen}
      />
    </BrowserRouter>
  );
}
