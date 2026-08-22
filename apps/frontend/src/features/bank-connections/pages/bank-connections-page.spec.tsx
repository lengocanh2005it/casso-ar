import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BankConnectionsPage } from './bank-connections-page';

vi.mock('../api/use-bank-connections', () => ({
  usePollConnections: () => ({
    data: { items: [] },
    isError: false,
    isPending: false,
  }),
}));
vi.mock('../components/connect-dialog', () => ({
  ConnectDialog: () => <button type="button">Kết nối ngân hàng</button>,
}));
vi.mock('../components/connection-table', () => ({
  ConnectionTable: () => <div>Danh sách kết nối</div>,
}));

describe('BankConnectionsPage', () => {
  it('keeps the bank connection heading and status section available', () => {
    render(<BankConnectionsPage />);

    expect(
      screen.getByRole('heading', { name: 'Kết nối ngân hàng' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trạng thái kết nối')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kết nối ngân hàng' }),
    ).toBeInTheDocument();
  });
});
