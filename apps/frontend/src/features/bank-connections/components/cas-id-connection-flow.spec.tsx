import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CasIdConnectionFlow } from './cas-id-connection-flow';

const { apiRequest, toastSuccess, toastError, openCasLinkPopup } = vi.hoisted(
  () => ({
    apiRequest: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    openCasLinkPopup: vi.fn(),
  }),
);

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock('@/lib/cas-link', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/cas-link')>('@/lib/cas-link');
  return { ...actual, openCasLinkPopup };
});

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function fakePopup() {
  return { closed: false, close: vi.fn() } as unknown as Window;
}

function renderFlow(onCompleted?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CasIdConnectionFlow onCompleted={onCompleted} />
    </QueryClientProvider>,
  );
}

function postMessage(data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data, origin: window.location.origin }),
    );
  });
}

beforeEach(() => {
  apiRequest.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  openCasLinkPopup.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CasIdConnectionFlow', () => {
  it('opens the Cas Link popup with the initiation result', async () => {
    apiRequest.mockResolvedValue({
      sessionId: 'session-1',
      grantToken: 'grant-1',
      redirectUri: 'http://localhost/callback?sessionId=session-1',
      linkBaseUrl: 'https://link.cas.so',
    });
    openCasLinkPopup.mockReturnValue(fakePopup());

    renderFlow();
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));

    await waitFor(() =>
      expect(openCasLinkPopup).toHaveBeenCalledWith(
        'grant-1',
        'http://localhost/callback?sessionId=session-1',
        'https://link.cas.so',
      ),
    );
  });

  it('exchanges the public token and calls onCompleted on CAS_LINK_SUCCESS', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/bank-connections/cas-id/initiate') {
        return Promise.resolve({
          sessionId: 'session-1',
          grantToken: 'grant-1',
          redirectUri: 'http://localhost/callback?sessionId=session-1',
          linkBaseUrl: 'https://link.cas.so',
        });
      }
      return Promise.resolve({ connectionId: 'conn-1', status: 'ACTIVE' });
    });
    const popup = fakePopup();
    openCasLinkPopup.mockReturnValue(popup);
    const onCompleted = vi.fn();

    renderFlow(onCompleted);
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));
    await waitFor(() => expect(openCasLinkPopup).toHaveBeenCalled());

    postMessage({ type: 'CAS_LINK_SUCCESS', publicToken: 'pub-1' });

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-connections/cas-id/sessions/session-1/exchange',
          data: { publicToken: 'pub-1' },
        }),
      ),
    );
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
    expect(popup.close).toHaveBeenCalled();
  });

  it('shows an error toast on CAS_LINK_CANCELLED without exchanging', async () => {
    apiRequest.mockResolvedValue({
      sessionId: 'session-1',
      grantToken: 'grant-1',
      redirectUri: 'http://localhost/callback?sessionId=session-1',
      linkBaseUrl: 'https://link.cas.so',
    });
    openCasLinkPopup.mockReturnValue(fakePopup());

    renderFlow();
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));
    await waitFor(() => expect(openCasLinkPopup).toHaveBeenCalled());

    postMessage({ type: 'CAS_LINK_CANCELLED' });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Liên kết ngân hàng thất bại. Vui lòng thử lại.',
      ),
    );
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast when the popup is blocked', async () => {
    apiRequest.mockResolvedValue({
      sessionId: 'session-1',
      grantToken: 'grant-1',
      redirectUri: 'http://localhost/callback?sessionId=session-1',
      linkBaseUrl: 'https://link.cas.so',
    });
    openCasLinkPopup.mockReturnValue(null);

    renderFlow();
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('popup')),
    );
  });

  it('shows an error toast if the user closes the popup manually', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    apiRequest.mockResolvedValue({
      sessionId: 'session-1',
      grantToken: 'grant-1',
      redirectUri: 'http://localhost/callback?sessionId=session-1',
      linkBaseUrl: 'https://link.cas.so',
    });
    const popup = fakePopup();
    openCasLinkPopup.mockReturnValue(popup);

    renderFlow();
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));
    await vi.waitFor(() => expect(openCasLinkPopup).toHaveBeenCalled());

    (popup as { closed: boolean }).closed = true;
    await act(() => vi.advanceTimersByTimeAsync(600));

    expect(toastError).toHaveBeenCalledWith(
      'Liên kết ngân hàng thất bại. Vui lòng thử lại.',
    );
  });
});
