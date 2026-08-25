import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivablePayments } from './receivable-payments';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));

function renderPayments() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceivablePayments receivableId="r1" />
    </QueryClientProvider>,
  );
}

describe('ReceivablePayments', () => {
  it('resolves a manual allocation to the organization member who made it', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/members'))
        return Promise.resolve({
          items: [{ userId: 'user-1', name: 'Nguyễn Minh Anh', role: 'OWNER' }],
        });
      return Promise.resolve({
        id: 'r1',
        allocations: [
          {
            id: 'pa1',
            paymentId: 'p1',
            allocatedAmount: 20_000_000,
            allocatedAt: '2026-08-01T00:00:00Z',
            allocatedByUserId: 'user-1',
          },
        ],
      });
    });

    renderPayments();

    expect(await screen.findByText('Nguyễn Minh Anh')).toBeInTheDocument();
    expect(screen.queryByText('user-1')).not.toBeInTheDocument();
  });

  it('falls back to a departed-member label when the actor is no longer a member', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/members')) return Promise.resolve({ items: [] });
      return Promise.resolve({
        id: 'r1',
        allocations: [
          {
            id: 'pa1',
            paymentId: 'p1',
            allocatedAmount: 20_000_000,
            allocatedAt: '2026-08-01T00:00:00Z',
            allocatedByUserId: 'user-gone',
          },
        ],
      });
    });

    renderPayments();

    expect(
      await screen.findByText('Người dùng đã rời tổ chức'),
    ).toBeInTheDocument();
  });
});
