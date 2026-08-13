import { lazy, type ReactNode, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { GuestRoute } from './protected-route';

const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/pages/forgot-password-page').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const InviteAcceptPage = lazy(() =>
  import('@/features/auth/pages/invite-accept-page').then((m) => ({
    default: m.InviteAcceptPage,
  })),
);
const LoginPage = lazy(() =>
  import('@/features/auth/pages/login-page').then((m) => ({
    default: m.LoginPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/pages/reset-password-page').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const SignupPage = lazy(() =>
  import('@/features/auth/pages/signup-page').then((m) => ({
    default: m.SignupPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import('@/features/auth/pages/verify-email-page').then((m) => ({
    default: m.VerifyEmailPage,
  })),
);
const BankConnectionsPage = lazy(() =>
  import('@/features/bank-connections/pages/bank-connections-page').then(
    (m) => ({ default: m.BankConnectionsPage }),
  ),
);
const CopilotPage = lazy(() =>
  import('@/features/copilot/pages/copilot-page').then((m) => ({
    default: m.CopilotPage,
  })),
);
const CustomersPage = lazy(() =>
  import('@/features/customers/pages/customers-page').then((m) => ({
    default: m.CustomersPage,
  })),
);
const CustomerDetailPage = lazy(() =>
  import('@/features/customers/pages/customer-detail-page').then((m) => ({
    default: m.CustomerDetailPage,
  })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/dashboard-page').then((m) => ({
    default: m.DashboardPage,
  })),
);
const ExceptionsPage = lazy(() =>
  import('@/features/exceptions/pages/exceptions-page').then((m) => ({
    default: m.ExceptionsPage,
  })),
);
const ReceivablesPage = lazy(() =>
  import('@/features/receivables/pages/receivables-page').then((m) => ({
    default: m.ReceivablesPage,
  })),
);
const ReceivableDetailPage = lazy(() =>
  import('@/features/receivables/pages/receivable-detail-page').then((m) => ({
    default: m.ReceivableDetailPage,
  })),
);
const RemindersPage = lazy(() =>
  import('@/features/reminders/pages/reminders-page').then((m) => ({
    default: m.RemindersPage,
  })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/pages/reports-page').then((m) => ({
    default: m.ReportsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/pages/settings-page').then((m) => ({
    default: m.SettingsPage,
  })),
);

function withPageSuspense(element: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Spinner className="size-6" />
        </div>
      }
    >
      {element}
    </Suspense>
  );
}

export const authRoutes: RouteObject[] = [
  {
    path: 'login',
    element: <GuestRoute>{withPageSuspense(<LoginPage />)}</GuestRoute>,
  },
  {
    path: 'signup',
    element: <GuestRoute>{withPageSuspense(<SignupPage />)}</GuestRoute>,
  },
  {
    path: 'verify-email',
    element: <GuestRoute>{withPageSuspense(<VerifyEmailPage />)}</GuestRoute>,
  },
  {
    path: 'forgot-password',
    element: (
      <GuestRoute>{withPageSuspense(<ForgotPasswordPage />)}</GuestRoute>
    ),
  },
  {
    path: 'reset-password',
    element: <GuestRoute>{withPageSuspense(<ResetPasswordPage />)}</GuestRoute>,
  },
  {
    path: 'invite-accept',
    element: <GuestRoute>{withPageSuspense(<InviteAcceptPage />)}</GuestRoute>,
  },
];

export const appRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: withPageSuspense(<DashboardPage />) },
  { path: 'customers', element: withPageSuspense(<CustomersPage />) },
  { path: 'customers/:id', element: withPageSuspense(<CustomerDetailPage />) },
  { path: 'receivables', element: withPageSuspense(<ReceivablesPage />) },
  {
    path: 'receivables/:id',
    element: withPageSuspense(<ReceivableDetailPage />),
  },
  {
    path: 'bank-connections',
    element: withPageSuspense(<BankConnectionsPage />),
  },
  { path: 'exceptions', element: withPageSuspense(<ExceptionsPage />) },
  { path: 'reminders', element: withPageSuspense(<RemindersPage />) },
  { path: 'copilot', element: withPageSuspense(<CopilotPage />) },
  { path: 'reports', element: withPageSuspense(<ReportsPage />) },
  { path: 'settings', element: withPageSuspense(<SettingsPage />) },
];
