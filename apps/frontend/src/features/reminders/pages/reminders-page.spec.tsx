import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RemindersPage } from './reminders-page';

const apiRequest = vi.fn();
const setParam = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));
vi.mock('@/lib/use-url-query-params', () => ({
  useUrlQueryParams: () => ({
    searchParams: new URLSearchParams(),
    setParam,
  }),
}));

describe('RemindersPage', () => {
  it('keeps both reminder workflows, the receivable filter, and compact empty states visible', async () => {
    apiRequest.mockImplementation((config: { url: string }) =>
      config.url === '/api/v1/reminder-policies'
        ? Promise.resolve([])
        : Promise.resolve({ items: [], total: 0, page: 1, limit: 20 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RemindersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Chính sách nhắc')).toBeTruthy();
    expect(screen.getByText('Lịch sử thực thi')).toBeTruthy();
    expect(
      await screen.findByRole('textbox', {
        name: 'Lọc theo khoản phải thu',
      }),
    ).toBeTruthy();
    expect(await screen.findAllByTestId('empty-state')).toHaveLength(2);
  });

  it('replaces the history entry when the receivableId filter changes, so fast typing does not drop keystrokes', async () => {
    apiRequest.mockImplementation((config: { url: string }) =>
      config.url === '/api/v1/reminder-policies'
        ? Promise.resolve([])
        : Promise.resolve({ items: [], total: 0, page: 1, limit: 20 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RemindersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(
      await screen.findByRole('textbox', {
        name: 'Lọc theo khoản phải thu',
      }),
      { target: { value: 'a' } },
    );

    await waitFor(() => expect(setParam).toHaveBeenCalled());
    expect(setParam).toHaveBeenCalledWith(
      'receivableId',
      expect.any(String),
      expect.objectContaining({ replace: true }),
    );
  });

  it('retries a failed policy load from its error state', async () => {
    let policyAttempts = 0;
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/reminder-policies') {
        policyAttempts += 1;
        return policyAttempts === 1
          ? Promise.reject(new Error('Network error'))
          : Promise.resolve([]);
      }
      return Promise.resolve({ items: [], total: 0, page: 1, limit: 20 });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RemindersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    fireEvent.click(retry);

    await waitFor(() => expect(policyAttempts).toBe(2));
    await waitFor(() => expect(retry).not.toBeInTheDocument());
  });
});
