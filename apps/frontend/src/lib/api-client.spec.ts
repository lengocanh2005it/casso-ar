import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes every request path with /api/v1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/customers');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/customers$/),
      expect.anything(),
    );
  });
});
