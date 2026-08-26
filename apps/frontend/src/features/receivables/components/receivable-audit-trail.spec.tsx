import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableAuditTrail } from './receivable-audit-trail';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));

function renderTrail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReceivableAuditTrail receivableId="rec-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReceivableAuditTrail', () => {
  it('requests audit logs scoped to the receivable and renders them', async () => {
    apiRequest.mockImplementation(
      ({ url, params }: { url: string; params?: Record<string, unknown> }) => {
        if (url.includes('/members')) {
          return Promise.resolve({
            items: [
              { userId: 'user-1', name: 'Nguyễn Minh Anh', role: 'OWNER' },
            ],
          });
        }
        expect(params).toMatchObject({
          receivableId: 'rec-1',
          page: 1,
          limit: 20,
        });
        return Promise.resolve({
          items: [
            {
              id: 'log-1',
              userId: 'user-1',
              actionType: 'PAYMENT_ALLOCATE',
              entityType: 'PaymentAllocation',
              entityId: 'alloc-1',
              beforeState: null,
              afterState: { receivableId: 'rec-1', allocatedAmount: 500000 },
              ipAddress: null,
              createdAt: '2026-08-26T00:00:00.000Z',
            },
          ],
          total: 1,
        });
      },
    );

    renderTrail();

    expect(await screen.findByText('Nguyễn Minh Anh')).toBeInTheDocument();
  });

  it('shows an empty state when there are no audit rows for this receivable', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/members')) return Promise.resolve({ items: [] });
      return Promise.resolve({ items: [], total: 0 });
    });

    renderTrail();

    expect(await screen.findByText(/chưa có nhật ký/i)).toBeInTheDocument();
  });
});
