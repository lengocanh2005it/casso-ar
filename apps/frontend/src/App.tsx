import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/app-layout';
import {
  UpgradeDialog,
  usePlanLimitDialog,
} from '@/features/settings/components/upgrade-dialog';
import { appRoutes, authRoutes } from '@/routes';
import { ProtectedRoute } from '@/routes/protected-route';

function renderRoute(route: (typeof appRoutes)[number]) {
  if (route.index) return <Route key="index" index element={route.element} />;
  return <Route key={route.path} path={route.path} element={route.element} />;
}

export function AppRoutes() {
  return (
    <Routes>
      {authRoutes.map(renderRoute)}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {appRoutes.map(renderRoute)}
      </Route>
    </Routes>
  );
}

export function App() {
  const planLimitDialog = usePlanLimitDialog();

  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <AppRoutes />
      <UpgradeDialog
        open={planLimitDialog.open}
        onOpenChange={planLimitDialog.setOpen}
      />
    </BrowserRouter>
  );
}
