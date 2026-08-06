import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
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
