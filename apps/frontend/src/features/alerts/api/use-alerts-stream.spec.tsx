import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAlertsStream } from './use-alerts-stream';

const getValidAccessToken = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: {
    getValidAccessToken: (...args: unknown[]) => getValidAccessToken(...args),
  },
}));

beforeEach(() => {
  getValidAccessToken.mockResolvedValue('test-token');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, 'invalidateQueries');
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAlertsStream', () => {
  it('opens an authenticated fetch stream without putting the token in the URL', async () => {
    renderHook(() => useAlertsStream(true), { wrapper });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/alerts/stream',
      expect.objectContaining({
        headers: {
          Accept: 'text/event-stream',
          Authorization: 'Bearer test-token',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('does not open a stream when enabled is false', async () => {
    renderHook(() => useAlertsStream(false), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('invalidates the alerts query cache on every message', async () => {
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"type":"alert.created"}\n'),
          );
          controller.enqueue(encoder.encode('\n'));
          controller.close();
        },
      }),
    });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useAlertsStream(true), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await vi.waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['alerts'] }),
    );
  });

  it('aborts the stream on unmount', async () => {
    let closeStream: (() => void) | undefined;
    fetchMock.mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          closeStream = () => controller.close();
        },
      }),
    });
    const { unmount } = renderHook(() => useAlertsStream(true), { wrapper });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    unmount();
    closeStream?.();

    expect(signal.aborted).toBe(true);
  });
});
