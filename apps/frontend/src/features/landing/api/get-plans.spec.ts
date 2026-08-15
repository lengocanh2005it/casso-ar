import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { fetchPlans } from './get-plans';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

describe('fetchPlans', () => {
  it('calls GET /api/v1/plans', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await fetchPlans();

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/plans',
      method: 'GET',
    });
  });
});
