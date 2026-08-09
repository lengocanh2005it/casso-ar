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
});
