import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAlertsStream } from './use-alerts-stream';

const getValidAccessToken = vi.fn();

vi.mock('@/lib/api-client', () => ({
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: {
    getValidAccessToken: (...args: unknown[]) => getValidAccessToken(...args),
  },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  getValidAccessToken.mockResolvedValue('test-token');
  vi.stubGlobal('EventSource', FakeEventSource);
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
  it('opens an EventSource to /api/v1/alerts/stream with the access token as a query param when enabled', async () => {
    renderHook(() => useAlertsStream(true), { wrapper });

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0]?.url).toBe(
      'http://localhost:3000/api/v1/alerts/stream?token=test-token',
    );
  });

  it('does not open an EventSource when enabled is false', async () => {
    renderHook(() => useAlertsStream(false), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('invalidates the alerts query cache on every message', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useAlertsStream(true), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0]?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'alert.created', unreadCount: 2 }),
      }),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['alerts'] });
  });

  it('closes the EventSource on unmount', async () => {
    const { unmount } = renderHook(() => useAlertsStream(true), { wrapper });

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    unmount();

    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });
});
