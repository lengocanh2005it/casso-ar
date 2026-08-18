import { Permission } from '@casso-ledger/shared-types';
import { lazy, type ReactNode, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { GuestRoute, PermissionRoute } from './protected-route';

const LandingPage = lazy(() =>
  import('@/features/landing').then((m) => ({ default: m.LandingPage })),
);

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
const ReceivableBalanceHistoryPage = lazy(() =>
  import(
    '@/features/receivable-balance-history/pages/receivable-balance-history-page'
  ).then((m) => ({ default: m.ReceivableBalanceHistoryPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/pages/settings-page').then((m) => ({
    default: m.SettingsPage,
  })),
);
const AdminLoginPage = lazy(() =>
  import('@/features/admin/pages/admin-login-page').then((m) => ({
    default: m.AdminLoginPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  import('@/features/admin/pages/admin-dashboard-page').then((m) => ({
    default: m.AdminDashboardPage,
  })),
);
const AdminOrganizationsPage = lazy(() =>
  import('@/features/admin/pages/admin-organizations-page').then((m) => ({
    default: m.AdminOrganizationsPage,
  })),
);
const AdminOrganizationMembersPage = lazy(() =>
  import('@/features/admin/pages/admin-organization-members-page').then(
    (m) => ({ default: m.AdminOrganizationMembersPage }),
  ),
);
const AdminAiUsagePage = lazy(() =>
  import('@/features/admin/pages/admin-ai-usage-page').then((m) => ({
    default: m.AdminAiUsagePage,
  })),
);
const NotFoundPage = lazy(() => import('@/features/errors/not-found-page'));

import { AdminLayout } from '@/components/layout/admin-layout';
import { AdminRoute } from './admin-route';

function withPageSuspense(element: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Spinner className="size-10 text-primary" />
        </div>
      }
    >
      {element}
    </Suspense>
  );
}

export const authRoutes: RouteObject[] = [
  {
    path: '/',
    element: <GuestRoute>{withPageSuspense(<LandingPage />)}</GuestRoute>,
  },
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
  { path: '*', element: withPageSuspense(<NotFoundPage />) },
];

export const adminRoutes: RouteObject[] = [
  {
    path: 'admin/login',
    element: withPageSuspense(<AdminLoginPage />),
  },
  {
    path: 'admin',
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      {
        path: 'dashboard',
        element: withPageSuspense(<AdminDashboardPage />),
      },
      {
        path: 'organizations',
        element: withPageSuspense(<AdminOrganizationsPage />),
      },
      {
        path: 'organizations/:organizationId/members',
        element: withPageSuspense(<AdminOrganizationMembersPage />),
      },
      {
        path: 'ai-usage',
        element: withPageSuspense(<AdminAiUsagePage />),
      },
      { path: '*', element: withPageSuspense(<NotFoundPage />) },
    ],
  },
];

export const appRoutes: RouteObject[] = [
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
  {
    path: 'receivable-balance-history',
    element: (
      <PermissionRoute permission={Permission.RECEIVABLE_AUDIT_READ}>
        {withPageSuspense(<ReceivableBalanceHistoryPage />)}
      </PermissionRoute>
    ),
  },
  { path: 'settings', element: withPageSuspense(<SettingsPage />) },
  { path: '*', element: withPageSuspense(<NotFoundPage />) },
];
