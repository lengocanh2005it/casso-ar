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
  getValidAccessToken.mockReset();
  getValidAccessToken.mockResolvedValue('test-token');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Minimal exclusive Web Locks stand-in (jsdom has no navigator.locks): one
// holder at a time, queued requests run when the holder's callback settles,
// and aborting a queued request rejects it.
function installFakeLocks() {
  // Per lock name, like the real Web Locks API.
  const locks = new Map<string, { held: boolean; queue: Array<() => void> }>();
  const request = (
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<unknown>,
  ) =>
    new Promise((resolve, reject) => {
      const lock = locks.get(name) ?? { held: false, queue: [] };
      locks.set(name, lock);
      const { queue } = lock;
      const run = () => {
        lock.held = true;
        callback()
          .then(resolve, reject)
          .finally(() => {
            lock.held = false;
            queue.shift()?.();
          });
      };
      options.signal?.addEventListener('abort', () => {
        const index = queue.indexOf(run);
        if (index >= 0) {
          queue.splice(index, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        }
      });
      if (lock.held) queue.push(run);
      else run();
    });
  vi.stubGlobal('navigator', { ...navigator, locks: { request } });
}

function openStream() {
  return {
    ok: true,
    body: new ReadableStream<Uint8Array>({ start() {} }),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, 'invalidateQueries');
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAlertsStream', () => {
  it('opens an authenticated fetch stream without putting the token in the URL', async () => {
    renderHook(() => useAlertsStream('user-1:org-1'), { wrapper });

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
    renderHook(() => useAlertsStream(null), { wrapper });

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
    renderHook(() => useAlertsStream('user-1:org-1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    // One refresh when the stream opens, one more for the message.
    await vi.waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
    expect(invalidateSpy).toHaveBeenLastCalledWith({ queryKey: ['alerts'] });
  });

  it('reconnects after the server closes the stream', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async () => ({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
      }));
      const { unmount } = renderHook(() => useAlertsStream('user-1:org-1'), {
        wrapper,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // A backend restart or proxy idle timeout used to end live alerts
      // until the user reloaded the page.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      // A stream that closes right after opening (a buffering proxy, a
      // handler failing after headers) must back off, not retry every 1s.
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes alerts in every tab when a stream (re)opens, covering the gap', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async () => ({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
      }));
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { unmount } = renderHook(() => useAlertsStream('user-1:org-1'), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      await vi.advanceTimersByTimeAsync(5_000);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      // No message arrived, but alerts raised while the stream was down (or
      // while another tab was taking it over) were otherwise never fetched.
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['alerts'] });
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops retrying once there is no session to stream for', async () => {
    vi.useFakeTimers();
    try {
      getValidAccessToken.mockResolvedValue(null);
      const { unmount } = renderHook(() => useAlertsStream('user-1:org-1'), {
        wrapper,
      });

      await vi.advanceTimersByTimeAsync(120_000);
      // Each retry would call the refresh endpoint for a logged-out user.
      expect(getValidAccessToken).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a single stream across tabs and hands it over when the holder closes', async () => {
    installFakeLocks();
    fetchMock.mockImplementation(async () => openStream());

    // Each tab held its own stream, and at six tabs Chrome's per-host
    // HTTP/1.1 connection limit starved every other API request.
    const firstTab = renderHook(() => useAlertsStream('user-1:org-1'), {
      wrapper,
    });
    const secondTab = renderHook(() => useAlertsStream('user-1:org-1'), {
      wrapper,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstTab.unmount();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    secondTab.unmount();
  });

  it('gives each account its own stream instead of queuing behind another account', async () => {
    installFakeLocks();
    fetchMock.mockImplementation(async () => openStream());

    // A tab signed in as another owner (or another organization) used to
    // wait forever on the origin-wide lock held by the first account's tab.
    const ownerA = renderHook(() => useAlertsStream('user-a:org-a'), {
      wrapper,
    });
    const ownerB = renderHook(() => useAlertsStream('user-b:org-b'), {
      wrapper,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    ownerA.unmount();
    ownerB.unmount();
  });

  it('relays stream messages to tabs that do not hold the stream', async () => {
    installFakeLocks();
    const encoder = new TextEncoder();
    let push: (() => void) | undefined;
    fetchMock.mockImplementation(async () => ({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          push = () =>
            controller.enqueue(
              encoder.encode('data: {"type":"alert.created"}\n\n'),
            );
        },
      }),
    }));
    const followerClient = new QueryClient();
    const followerInvalidate = vi.spyOn(followerClient, 'invalidateQueries');

    const leader = renderHook(() => useAlertsStream('user-1:org-1'), {
      wrapper,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const follower = renderHook(() => useAlertsStream('user-1:org-1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={followerClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    // Let the on-open refresh settle so the assertion below is about the
    // relayed message, not the open.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const callsBeforeMessage = followerInvalidate.mock.calls.length;
    push?.();

    await vi.waitFor(() =>
      expect(followerInvalidate.mock.calls.length).toBe(callsBeforeMessage + 1),
    );
    expect(followerInvalidate).toHaveBeenLastCalledWith({
      queryKey: ['alerts'],
    });
    leader.unmount();
    follower.unmount();
  });

  it('aborts the stream on unmount', async () => {
    fetchMock.mockResolvedValue(openStream());
    const { unmount } = renderHook(() => useAlertsStream('user-1:org-1'), {
      wrapper,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
  });
});
