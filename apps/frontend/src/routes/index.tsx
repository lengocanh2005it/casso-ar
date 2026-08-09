import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { InviteAcceptPage } from '@/features/auth/invite-accept-page';
import { LoginPage } from '@/features/auth/login-page';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { SignupPage } from '@/features/auth/signup-page';
import { VerifyEmailPage } from '@/features/auth/verify-email-page';
import { BankConnectionsPage } from '@/features/bank-connections';
import { CopilotPage } from '@/features/copilot';
import { CustomersPage } from '@/features/customers';
import { DashboardPage } from '@/features/dashboard';
import { ExceptionsPage } from '@/features/exceptions';
import { ReceivablesPage } from '@/features/receivables';
import { RemindersPage } from '@/features/reminders';
import { ReportsPage } from '@/features/reports';
import { SettingsPage } from '@/features/settings';
import { TransactionsPage } from '@/features/transactions';
import { GuestRoute } from './protected-route';

export const authRoutes: RouteObject[] = [
  {
    path: 'login',
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  {
    path: 'signup',
    element: (
      <GuestRoute>
        <SignupPage />
      </GuestRoute>
    ),
  },
  {
    path: 'verify-email',
    element: (
      <GuestRoute>
        <VerifyEmailPage />
      </GuestRoute>
    ),
  },
  {
    path: 'forgot-password',
    element: (
      <GuestRoute>
        <ForgotPasswordPage />
      </GuestRoute>
    ),
  },
  {
    path: 'reset-password',
    element: (
      <GuestRoute>
        <ResetPasswordPage />
      </GuestRoute>
    ),
  },
  {
    path: 'invite-accept',
    element: (
      <GuestRoute>
        <InviteAcceptPage />
      </GuestRoute>
    ),
  },
];

export const appRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'customers', element: <CustomersPage /> },
  { path: 'receivables', element: <ReceivablesPage /> },
  { path: 'bank-connections', element: <BankConnectionsPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'exceptions', element: <ExceptionsPage /> },
  { path: 'reminders', element: <RemindersPage /> },
  { path: 'copilot', element: <CopilotPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'settings', element: <SettingsPage /> },
];
