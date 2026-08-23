import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingOwnershipTransferBanner } from './pending-ownership-transfer-banner';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingOwnershipTransferBanner organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe('PendingOwnershipTransferBanner', () => {
  it('renders nothing when there is no pending transfer', async () => {
    apiRequest.mockResolvedValue(null);
    const { container } = renderBanner();

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an accept/decline prompt when a transfer is pending', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url.includes('/accept') || config.url.includes('/decline')) {
        return Promise.resolve({ status: 'ACCEPTED' });
      }
      return Promise.resolve({
        id: 'req-1',
        status: 'PENDING_ACCEPTANCE',
        fromUserId: 'owner-1',
        toUserId: 'me',
        acceptanceExpiresAt: '2026-08-25T00:00:00.000Z',
        createdAt: '2026-08-23T00:00:00.000Z',
      });
    });
    renderBanner();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Chấp nhận' }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/auth/organizations/org-1/ownership-transfers/req-1/accept',
          method: 'POST',
        }),
      ),
    );
  });
});
