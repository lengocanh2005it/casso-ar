import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BankConnection } from '../types';
import { ConnectionTable } from './connection-table';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('../api/use-bank-connections', () => ({
  useDisconnectConnection: () => ({ mutate: vi.fn(), isPending: false }),
}));

const connection: BankConnection = {
  id: 'connection-1',
  accountNumber: '0123456789',
  bankName: 'Casso Bank',
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
      screen.getByRole('button', { name: /disconnect/i }),
    ).toBeInTheDocument();
  });
});
