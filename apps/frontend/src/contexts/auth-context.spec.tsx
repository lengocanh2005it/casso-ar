import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    setAccessToken: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
    resetLogoutState: vi.fn(),
  },
  apiRequest,
}));

function Probe() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{isAuthenticated ? `hello ${user?.name}` : 'anonymous'}</div>;
}

type AuthActions = Pick<
  ReturnType<typeof useAuth>,
  'refreshUser' | 'login' | 'logout'
>;

function ActionProbe({
  onRender,
}: {
  onRender: (actions: AuthActions) => void;
}) {
  const { refreshUser, login, logout } = useAuth();
  onRender({ refreshUser, login, logout });
  return null;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
  });

  it('restores a session from /api/v1/me when a token exists', async () => {
    getValidAccessToken.mockResolvedValue('token');
    apiRequest.mockResolvedValue({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      role: 'OWNER',
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      subscriptionPlan: 'FREE',
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('hello Owner')).toBeVisible());
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/me',
      method: 'GET',
    });
  });

  it('stays anonymous when no refreshable session exists', async () => {
    getValidAccessToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('anonymous')).toBeVisible());
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('keeps auth actions stable when provider state changes', async () => {
    getValidAccessToken.mockResolvedValue(null);
    const renders: AuthActions[] = [];

    render(
      <AuthProvider>
        <ActionProbe onRender={(actions) => renders.push(actions)} />
      </AuthProvider>,
    );

    await waitFor(() => expect(renders.length).toBeGreaterThan(1));
    const first = renders[0];
    const last = renders.at(-1);

    expect(last?.refreshUser).toBe(first?.refreshUser);
    expect(last?.login).toBe(first?.login);
    expect(last?.logout).toBe(first?.logout);
  });
});
