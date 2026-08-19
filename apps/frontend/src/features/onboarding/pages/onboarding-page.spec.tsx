import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import {
  useConnectCasId,
  useExchangeCasId,
} from '@/features/bank-connections/api/use-bank-connections';
import { openCasLinkPopup } from '@/lib/cas-link';
import { OnboardingPage } from './onboarding-page';

const useAuthMock = vi.mocked(useAuth);
const useConnectCasIdMock = vi.mocked(useConnectCasId);
const useExchangeCasIdMock = vi.mocked(useExchangeCasId);
const openCasLinkPopupMock = vi.mocked(openCasLinkPopup);

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/bank-connections/api/use-bank-connections', () => ({
  useConnectCasId: vi.fn(),
  useExchangeCasId: vi.fn(),
}));

vi.mock('@/lib/cas-link', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/cas-link')>('@/lib/cas-link');
  return { ...actual, openCasLinkPopup: vi.fn() };
});

function renderPage(user: { role: string; bankingLinked: boolean }) {
  const refreshUser = vi.fn().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({
    user: {
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      subscriptionPlan: 'FREE',
      ...user,
    },
    isLoading: false,
    isAuthenticated: true,
    refreshUser,
  } as never);

  return {
    refreshUser,
    ...render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

describe('OnboardingPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a waiting state when the member cannot manage bank connections', () => {
    useConnectCasIdMock.mockReturnValue({} as never);
    useExchangeCasIdMock.mockReturnValue({} as never);

    renderPage({ role: 'VIEWER', bankingLinked: false });

    expect(screen.getByText('Liên kết ngân hàng')).toBeInTheDocument();
    expect(screen.getByText(/owner hoặc finance manager/i)).toBeInTheDocument();
  });

  it('refreshes the profile and navigates to dashboard after linking', async () => {
    const connectMutation = {
      isPending: false,
      mutate: vi.fn(
        (_input: unknown, options: { onSuccess: (result: unknown) => void }) =>
          options.onSuccess({
            sessionId: 'session-1',
            grantToken: 'grant',
            redirectUri: 'http://localhost/callback?sessionId=session-1',
            linkBaseUrl: 'https://link.cas.so',
          }),
      ),
    };
    const exchangeMutation = {
      isPending: false,
      mutate: vi.fn(
        (
          _input: unknown,
          options: { onSuccess: () => void; onSettled: () => void },
        ) => {
          options.onSuccess();
          options.onSettled();
        },
      ),
    };
    useConnectCasIdMock.mockReturnValue(connectMutation as never);
    useExchangeCasIdMock.mockReturnValue(exchangeMutation as never);
    openCasLinkPopupMock.mockReturnValue({
      closed: false,
      close: vi.fn(),
    } as unknown as Window);

    const { refreshUser } = renderPage({
      role: 'OWNER',
      bankingLinked: false,
    });

    fireEvent.click(screen.getByRole('button', { name: /kết nối ngân hàng/i }));
    await waitFor(() => expect(openCasLinkPopupMock).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'CAS_LINK_SUCCESS', publicToken: 'public-token' },
          origin: window.location.origin,
        }),
      );
    });

    await waitFor(() => expect(refreshUser).toHaveBeenCalledOnce());
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
