import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAlerts,
  useDeleteAlert,
  useDeleteAllAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from './use-alerts';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the first page with unreadOnly=false by default', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderHook(() => useAlerts(), { wrapper });

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts',
        method: 'GET',
        params: { page: 1, limit: 20, unreadOnly: false },
      }),
    );
  });

  it('does not call the API when enabled is false', async () => {
    renderHook(() => useAlerts(1, false, false), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('useMarkAlertRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes /alerts/:id/read', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMarkAlertRead(), { wrapper });

    result.current.mutate('alert-1');

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1/read',
        method: 'PATCH',
      }),
    );
  });
});

describe('useMarkAllAlertsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes /alerts/read-all', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMarkAllAlertsRead(), { wrapper });

    result.current.mutate();

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/read-all',
        method: 'PATCH',
      }),
    );
  });
});

describe('useDeleteAlert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DELETEs /alerts/:id', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeleteAlert(), { wrapper });

    result.current.mutate('alert-1');

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1',
        method: 'DELETE',
      }),
    );
  });
});

describe('useDeleteAllAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DELETEs /alerts', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeleteAllAlerts(), { wrapper });

    result.current.mutate();

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts',
        method: 'DELETE',
      }),
    );
  });
});
