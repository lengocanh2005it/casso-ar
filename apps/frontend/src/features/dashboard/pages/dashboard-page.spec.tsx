import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './dashboard-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('shows KPI cards, the pending-review banner, and top overdue customers once data loads', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/bank-transactions/pending-review-count') {
        return Promise.resolve({ count: 7 });
      }
      if (url === '/api/v1/reports/dashboard-summary') {
        return Promise.resolve({
          totalOutstanding: 100_000_000,
          totalOverdue: 30_000_000,
          overdueRate: 0.3,
          cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
          topOverdueCustomers: [
            {
              customerId: 'c1',
              customerName: 'Công ty A',
              totalOverdue: 20_000_000,
            },
          ],
          autoMatchRate: null,
          manualHandlingRate: null,
          reminderEffectiveness: null,
        });
      }
      if (url === '/api/v1/activity') {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('100.000.000 ₫')).toBeTruthy());
    expect(screen.getByText('7', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toBeTruthy();
    expect(screen.getByText('Công ty A')).toBeTruthy();
  });
});
