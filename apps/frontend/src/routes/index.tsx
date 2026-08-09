import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import {
  ForgotPasswordPage,
  InviteAcceptPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
  VerifyEmailPage,
} from '@/features/auth';
import { BankConnectionsPage } from '@/features/bank-connections';
import { CopilotPage } from '@/features/copilot';
import { CustomerDetailPage, CustomersPage } from '@/features/customers';
import { DashboardPage } from '@/features/dashboard';
import { ExceptionsPage } from '@/features/exceptions';
import { ReceivableDetailPage, ReceivablesPage } from '@/features/receivables';
import { RemindersPage } from '@/features/reminders';
import { ReportsPage } from '@/features/reports';
import { SettingsPage } from '@/features/settings';
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
  { path: 'customers/:id', element: <CustomerDetailPage /> },
  { path: 'receivables', element: <ReceivablesPage /> },
  { path: 'receivables/:id', element: <ReceivableDetailPage /> },
  { path: 'bank-connections', element: <BankConnectionsPage /> },
  { path: 'exceptions', element: <ExceptionsPage /> },
  { path: 'reminders', element: <RemindersPage /> },
  { path: 'copilot', element: <CopilotPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'settings', element: <SettingsPage /> },
];
