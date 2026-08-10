import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './reports-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

describe('ReportsPage', () => {
  it('renders aging buckets with formatted amounts and a total row', async () => {
    apiRequest
      .mockResolvedValueOnce({
        totalOutstanding: 100_000_000,
        totalOverdue: 30_000_000,
        overdueRate: 0.3,
        cashForecast: {
          forecast7d: 10_000_000,
          forecast14d: 20_000_000,
          forecast30d: 30_000_000,
        },
        topOverdueCustomers: [],
        autoMatchRate: 0.8,
        manualHandlingRate: 0.2,
        reminderEffectiveness: 0.5,
      })
      .mockResolvedValueOnce({
        buckets: [
          { bucket: 'NOT_DUE', count: 3, totalRemaining: 70_000_000 },
          { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 30_000_000 },
          { bucket: 'OVERDUE_1_7', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: 0 },
        ],
      });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ReportsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('70.000.000 ₫')).toBeTruthy());
    await waitFor(() =>
      expect(
        screen.getAllByText(/100.000.000 ₫/).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getByText('OVERDUE_31_60')).toBeTruthy();
  });
});
