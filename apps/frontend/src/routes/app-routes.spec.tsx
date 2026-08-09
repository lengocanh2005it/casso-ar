import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import { AuthProvider } from '@/contexts/auth-context';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  apiRequest,
}));

vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

describe('application routes', () => {
  it('redirects an unauthenticated app route to login', async () => {
    getValidAccessToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeVisible(),
    );
  });

  it('exposes the invite route without the app shell', async () => {
    getValidAccessToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/invite-accept?token=invite-token']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /nhận lời mời/i }),
      ).toBeVisible(),
    );
    expect(screen.queryByText('Casso Ledger')).not.toBeInTheDocument();
  });
});
