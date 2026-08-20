import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BankConnection } from '../types';
import { ConnectionTable } from './connection-table';

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
      screen.getByRole('button', { name: /disconnect/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reconnect/i }),
    ).not.toBeInTheDocument();
  });

  it('renders one API-key rotation action for connections sharing an authorization', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(
      <ConnectionTable
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
      <ConnectionTable
        connections={[{ ...connection, status: 'REQUIRES_REAUTHORIZATION' }]}
      />,
    );

    expect(
      screen.getByRole('button', { name: /đổi api key/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /disconnect/i }),
    ).not.toBeInTheDocument();
  });
});
