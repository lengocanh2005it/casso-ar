import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

const { getValidAccessToken, apiRequest, setAccessToken, hasKnownSession } =
  vi.hoisted(() => ({
    getValidAccessToken: vi.fn(),
    apiRequest: vi.fn(),
    setAccessToken: vi.fn(),
    hasKnownSession: vi.fn(),
  }));

vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    setAccessToken,
    hasKnownSession,
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
    setAccessToken.mockReset();
    hasKnownSession.mockReset().mockReturnValue(true);
  });

  it('never calls the refresh endpoint when no session was ever established', async () => {
    hasKnownSession.mockReturnValue(false);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('anonymous')).toBeVisible());
    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('restores a session from /api/v1/auth/me when a token exists', async () => {
    getValidAccessToken.mockResolvedValue('token');
    apiRequest.mockResolvedValue({
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      role: 'OWNER',
      organizationId: 'org-1',
      organizationName: 'Casso AR',
      subscriptionPlan: 'FREE',
      bankingLinked: true,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('hello Owner')).toBeVisible());
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/me',
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

  it('resolves login() even when the post-login /auth/me call fails', async () => {
    getValidAccessToken.mockResolvedValue(null);
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/auth/login') {
        return Promise.resolve({ accessToken: 'fresh-token' });
      }
      return Promise.reject(new Error('me failed'));
    });
    let actions: AuthActions | undefined;

    render(
      <AuthProvider>
        <ActionProbe onRender={(a) => (actions = a)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(actions).toBeDefined());

    await expect(
      actions?.login('owner@casso.vn', 'password'),
    ).resolves.toBeUndefined();
    expect(setAccessToken).toHaveBeenCalledWith('fresh-token');
  });
});
