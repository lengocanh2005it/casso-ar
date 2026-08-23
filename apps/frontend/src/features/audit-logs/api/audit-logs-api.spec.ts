import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { fetchAuditLogs } from './audit-logs-api';

describe('fetchAuditLogs', () => {
  it('requests audit logs with pagination and the provided filters', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchAuditLogs(
      { actorUserId: 'user-1', entityType: 'Receivable' },
      2,
      20,
    );

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/audit-logs',
      method: 'GET',
      params: {
        page: 2,
        limit: 20,
        actorUserId: 'user-1',
        entityType: 'Receivable',
      },
    });
  });

  it('omits empty filters from the request params', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchAuditLogs({}, 1, 20);

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/audit-logs',
      method: 'GET',
      params: { page: 1, limit: 20 },
    });
  });
});
