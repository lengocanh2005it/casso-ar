import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationHistoryDialog } from './authorization-history-dialog';

const { useAuthorizationAuditEvents } = vi.hoisted(() => ({
  useAuthorizationAuditEvents: vi.fn(),
}));

vi.mock('../api/use-bank-connections', () => ({ useAuthorizationAuditEvents }));

describe('AuthorizationHistoryDialog', () => {
  it('shows the rotate event with old/new masked key and bank name once opened', () => {
    useAuthorizationAuditEvents.mockReturnValue({
      data: {
        items: [
          {
            id: 'evt-1',
            bankConnectionId: 'conn-1',
            eventType: 'API_KEY_ROTATED',
            actorUserId: 'user-1',
            maskedApiKey: null,
            oldMaskedApiKey: '••••1111',
            newMaskedApiKey: '••••2222',
            accountNumber: '111',
            oldBankName: 'Old Bank',
            newBankName: 'New Bank',
            oldAccountHolderName: 'OLD NAME',
            newAccountHolderName: 'NEW NAME',
            createdAt: '2026-08-10T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isPending: false,
      isError: false,
    });

    render(<AuthorizationHistoryDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /lịch sử/i }));

    expect(screen.getByText('Đổi API Key')).toBeInTheDocument();
    expect(screen.getByText(/••••1111.*••••2222/)).toBeInTheDocument();
    expect(screen.getByText(/Old Bank.*New Bank/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', () => {
    useAuthorizationAuditEvents.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 50 },
      isPending: false,
      isError: false,
    });

    render(<AuthorizationHistoryDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /lịch sử/i }));

    expect(screen.getByText('Chưa có lịch sử.')).toBeInTheDocument();
  });
});
