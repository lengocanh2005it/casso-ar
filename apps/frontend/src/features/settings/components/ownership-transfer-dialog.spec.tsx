import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OwnershipTransferDialog } from './ownership-transfer-dialog';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OwnershipTransferDialog
        open
        onOpenChange={() => {}}
        organizationId="org-1"
        candidates={[
          { userId: 'user-2', name: 'Kế toán', email: 'ke-toan@congtyb.vn' },
        ]}
      />
    </QueryClientProvider>,
  );
}

describe('OwnershipTransferDialog', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('requests a transfer with the selected target and current password', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url.includes('/current')) return Promise.resolve(null);
      return Promise.resolve({
        id: 'req-1',
        status: 'PENDING_OTP_CONFIRMATION',
        fromUserId: 'owner-1',
        toUserId: 'user-2',
        acceptanceExpiresAt: null,
        createdAt: '2026-08-23T00:00:00.000Z',
      });
    });
    renderDialog();

    fireEvent.click(screen.getByRole('combobox', { name: 'Người nhận' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Kế toán' }));
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'my-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi OTP' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/auth/organizations/org-1/ownership-transfers',
          method: 'POST',
          data: { targetUserId: 'user-2', currentPassword: 'my-password' },
        }),
      ),
    );
  });
});
