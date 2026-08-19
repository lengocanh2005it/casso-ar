import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CasIdCallbackPage } from './cas-id-callback-page';

const { toastSuccess, toastError, apiRequest } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderCallback(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/bank-connections/cas-id/callback"
            element={<CasIdCallbackPage />}
          />
          <Route
            path="/bank-connections"
            element={<div>bank-connections</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  apiRequest.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CasIdCallbackPage', () => {
  it('forwards a success result to the opener and closes itself', async () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('opener', { postMessage });
    vi.stubGlobal('close', close);

    renderCallback(
      '/bank-connections/cas-id/callback?sessionId=session-1&publicToken=pub-1',
    );

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'CAS_LINK_SUCCESS', publicToken: 'pub-1' },
        window.location.origin,
      ),
    );
    expect(close).toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('exchanges the token itself and redirects when there is no opener', async () => {
    apiRequest.mockResolvedValue({ connectionId: 'conn-1', status: 'ACTIVE' });

    renderCallback(
      '/bank-connections/cas-id/callback?sessionId=session-1&publicToken=pub-1',
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-connections/cas-id/sessions/session-1/exchange',
          data: { publicToken: 'pub-1' },
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText('bank-connections')).toBeInTheDocument(),
    );
  });

  it('shows an error toast and redirects when the user cancelled and there is no opener', async () => {
    renderCallback(
      '/bank-connections/cas-id/callback?sessionId=session-1&error=access_denied',
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Liên kết ngân hàng thất bại. Vui lòng thử lại.',
      ),
    );
    await waitFor(() =>
      expect(screen.getByText('bank-connections')).toBeInTheDocument(),
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
