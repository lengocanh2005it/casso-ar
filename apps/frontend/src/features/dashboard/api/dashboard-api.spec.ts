import { describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { fetchOrganizationActivity } from './dashboard-api';

describe('fetchOrganizationActivity', () => {
  it('calls GET /api/v1/activity with page and a fixed limit', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });

    await fetchOrganizationActivity(1);

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/activity',
      method: 'GET',
      params: { page: 1, limit: 10 },
    });
  });
});
