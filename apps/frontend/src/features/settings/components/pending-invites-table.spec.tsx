import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvitationCooldownKey } from '@/lib/use-resend-cooldown';
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

const invite2 = {
  id: 'inv-2',
  email: 'khac@congtyb.vn',
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
  beforeEach(() => {
    apiRequest.mockReset();
    sessionStorage.clear();
  });

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

  it('disables only the resent invite, not other pending invites', async () => {
    apiRequest
      .mockResolvedValueOnce({
        items: [invite, invite2],
        total: 2,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({ success: true });
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('moi@congtyb.vn')).toBeTruthy(),
    );
    const resendButtons = screen.getAllByRole('button', { name: 'Gửi lại' });
    fireEvent.click(resendButtons[0]);

    const resentButton = await screen.findByRole('button', {
      name: 'Gửi lại (30s)',
    });
    expect(resentButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gửi lại' })).not.toBeDisabled();
  });

  it('does not disable the resend button when the request fails', async () => {
    apiRequest
      .mockResolvedValueOnce({
        items: [invite],
        total: 1,
        page: 1,
        limit: 100,
      })
      .mockRejectedValueOnce(new Error('rate limited'));
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('moi@congtyb.vn')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Gửi lại' })).not.toBeDisabled();
  });

  it('escalates the cooldown to 60s on a second resend of the same invitation', async () => {
    sessionStorage.setItem(
      buildInvitationCooldownKey('org-1', 'inv-1'),
      JSON.stringify({ stepIndex: 1, cooldownUntil: Date.now() - 1000 }),
    );
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

    expect(
      await screen.findByRole('button', { name: 'Gửi lại (60s)' }),
    ).toBeDisabled();
  });

  it('persists an active cooldown for an invitation across a remount', async () => {
    sessionStorage.setItem(
      buildInvitationCooldownKey('org-1', 'inv-1'),
      JSON.stringify({ stepIndex: 1, cooldownUntil: Date.now() + 17_000 }),
    );
    apiRequest.mockResolvedValueOnce({
      items: [invite],
      total: 1,
      page: 1,
      limit: 100,
    });
    renderTable();

    expect(
      await screen.findByRole('button', { name: 'Gửi lại (17s)' }),
    ).toBeDisabled();
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
