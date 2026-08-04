import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { BankConnectionsPage } from '@/features/bank-connections/bank-connections-page';
import { CopilotPage } from '@/features/copilot/copilot-page';
import { CustomersPage } from '@/features/customers/customers-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { ExceptionsPage } from '@/features/exceptions/exceptions-page';
import { ReceivablesPage } from '@/features/receivables/receivables-page';
import { RemindersPage } from '@/features/reminders/reminders-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';

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
