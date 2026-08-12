import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingInvitesTable } from './pending-invites-table';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const invite = {
  id: 'inv-1',
  email: 'moi@congtyb.vn',
  role: 'VIEWER',
  invitedAt: '2026-08-12T00:00:00.000Z',
  expiresAt: '2026-08-19T00:00:00.000Z',
};

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingInvitesTable organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe('PendingInvitesTable', () => {
  it('shows the empty state when there are no pending invites', async () => {
    apiRequest.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    });
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('Không có lời mời nào đang chờ.')).toBeTruthy(),
    );
  });

  it('resends an invite', async () => {
    apiRequest
      .mockResolvedValueOnce({
        items: [invite],
        total: 1,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({ success: true });
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('moi@congtyb.vn')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/invites/inv-1/resend',
          method: 'POST',
        }),
      ),
    );
  });

  it('confirms before revoking an invite', async () => {
    apiRequest
      .mockResolvedValueOnce({
        items: [invite],
        total: 1,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce(undefined);
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('moi@congtyb.vn')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/invites/inv-1',
          method: 'DELETE',
        }),
      ),
    );
  });
});
