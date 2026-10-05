import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '@/lib/format';
import type { BankConnection } from '../types';
import { ConnectionActions, ConnectionTable } from './connection-table';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('../api/use-bank-connections', () => ({
  useDisconnectConnection: () => ({ mutate: vi.fn(), isPending: false }),
  usePreviewCassoFlowAuthorizationRotation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRotateCassoFlowAuthorization: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));
vi.mock('./reveal-api-key-dialog', () => ({
  RevealApiKeyDialog: ({ authorizationId }: { authorizationId: string }) => (
    <button type="button">Hiện API Key ({authorizationId})</button>
  ),
}));
vi.mock('./authorization-history-dialog', () => ({
  AuthorizationHistoryDialog: ({
    authorizationId,
  }: {
    authorizationId: string;
  }) => <button type="button">Lịch sử ({authorizationId})</button>,
}));
vi.mock('./connect-dialog', () => ({
  ConnectDialog: () => <button type="button">Kết nối ngân hàng</button>,
}));

const connection: BankConnection = {
  id: 'connection-1',
  cassoFlowAuthorizationId: 'authorization-1',
  accountNumber: '0123456789',
  bankName: 'Casso Bank',
  accountHolderName: 'NGUYEN VAN A',
  status: 'ACTIVE',
  connectedAt: '2026-08-10T00:00:00Z',
  lastSyncAt: '2026-08-10T00:00:00Z',
  createdAt: '2026-08-10T00:00:00Z',
};

describe('ConnectionTable', () => {
  it('renders an active connection and its disconnect action', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[connection]} />);

    expect(screen.getByText('Casso Bank')).toBeInTheDocument();
    expect(screen.getByText('0123456789')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ngắt kết nối/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /kết nối lại/i }),
    ).not.toBeInTheDocument();
  });

  it('renders one API-key rotation action for connections sharing an authorization', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(
      <ConnectionActions
        connections={[
          connection,
          {
            ...connection,
            id: 'connection-2',
            accountNumber: '9876543210',
          },
        ]}
      />,
    );

    expect(
      screen.getAllByRole('button', { name: /đổi api key/i }),
    ).toHaveLength(1);
  });

  it('shows the shared API-key rotation action, not disconnect, for a connection requiring reauthorization', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(
      <ConnectionActions
        connections={[{ ...connection, status: 'REQUIRES_REAUTHORIZATION' }]}
      />,
    );

    expect(
      screen.getByRole('button', { name: /đổi api key/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /ngắt kết nối/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the reveal-key action for a role with BANK_CONNECTION_REVEAL_KEY', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionActions connections={[connection]} />);

    expect(
      screen.getByRole('button', { name: /hiện api key/i }),
    ).toBeInTheDocument();
  });

  it('hides the reveal-key action for a role without BANK_CONNECTION_REVEAL_KEY', () => {
    useAuth.mockReturnValue({ user: { role: 'ACCOUNTANT' } });

    render(<ConnectionActions connections={[connection]} />);

    expect(
      screen.queryByRole('button', { name: /hiện api key/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the history action for a user who can reveal the API key', () => {
    useAuth.mockReturnValue({ user: { role: 'FINANCE_MANAGER' } });

    render(<ConnectionActions connections={[connection]} />);

    expect(
      screen.getByRole('button', { name: /lịch sử \(authorization-1\)/i }),
    ).toBeInTheDocument();
  });

  it('keeps authorization actions outside the connection table', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(
      <div>
        <ConnectionActions connections={[connection]} />
        <ConnectionTable connections={[connection]} />
      </div>,
    );

    expect(
      screen.getByRole('button', { name: /lịch sử \(authorization-1\)/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).queryByRole('button', {
        name: /lịch sử \(authorization-1\)/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('shows the bank empty state when there are no connections', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Chưa có kết nối ngân hàng')).toBeInTheDocument();
  });

  it('aligns the account number and last-sync columns like other money/date tables', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[connection]} />);

    // Monospaced digits right-aligned, matching the receivables/exceptions
    // tables so numbers line up column-to-column instead of ragged-left.
    const accountCell = screen.getByText('0123456789').closest('td');
    expect(accountCell).toHaveClass('text-right', 'tabular-nums');
    const syncCell = screen
      .getByText(formatDateTime(connection.lastSyncAt ?? ''))
      .closest('td');
    expect(syncCell).toHaveClass('text-right', 'tabular-nums');

    // Headers must follow their cells, otherwise the label sits left over
    // right-aligned data — the same half-pattern #346 was fixing.
    const [accountHead, syncHead] = screen
      .getAllByRole('columnheader')
      .filter((h) =>
        ['Số tài khoản', 'Đồng bộ gần nhất'].includes(h.textContent ?? ''),
      );
    expect(accountHead).toHaveClass('text-right');
    expect(syncHead).toHaveClass('text-right');
  });

  it('names the disconnect action with the bank instead of a generic label', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[connection]} />);

    expect(
      screen.getByRole('button', { name: /ngắt kết nối.*casso bank/i }),
    ).toBeInTheDocument();
  });

  it('drops the forced min-width so a phone does not scroll the table sideways', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[connection]} />);

    // `min-w-180` alone is what forced a 720px table into a ~290px phone
    // viewport. Below md the row becomes a card instead, so the width floor
    // has to go with it or the scroller stays no matter how the row lays out.
    const table = screen.getByRole('table');
    expect(table).not.toHaveClass('min-w-180');

    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveClass('max-md:grid');

    // Bank + account become the card's title block; status and last-sync
    // fold under it; the disconnect button sits on its own row.
    const bankCell = screen.getByText('Casso Bank').closest('td');
    expect(bankCell?.className).toContain('max-md:col-span-2');

    const statusCell = screen.getByText('Đang hoạt động').closest('td');
    expect(statusCell?.className).toContain('max-md:col-start-1');

    // The header only makes sense while the row is still a real table, so
    // the whole <thead> goes — same rule as the customers table.
    expect(screen.getAllByRole('row')[0].closest('thead')).toHaveClass(
      'max-md:hidden',
    );
  });

  it('gives the connection card breathing room and an unlabelled title line', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[connection]} />);

    // Five stacked label/value rows at 8px spacing and a 2px label margin
    // left each label sitting on the value above it. The card now uses 12px
    // row spacing, 16px vertical padding and 4px under each label.
    const row = screen.getAllByRole('row')[1];
    expect(row.className).toContain('max-md:gap-y-3');
    expect(row.className).toContain('max-md:py-4');

    // The bank name is the card's title — labelling it repeats what position
    // and font weight already say, so only the three secondary fields and
    // the action row carry a label.
    const labels = [...row.querySelectorAll('.md\\:hidden')].map((el) =>
      (el.textContent || '').trim(),
    );
    expect(labels).toEqual([
      'Số tài khoản',
      'Trạng thái',
      'Đồng bộ gần nhất',
      'Thao tác',
    ]);
    expect(labels).not.toContain('Ngân hàng');
  });
});
