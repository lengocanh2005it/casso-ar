import { describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: vi.fn(),
}));

import { fetchSmtpConfig } from './settings-api';

describe('fetchSmtpConfig', () => {
  it('returns null when the API responds 404 (not configured)', async () => {
    apiRequest.mockRejectedValueOnce({ response: { status: 404 } });

    expect(await fetchSmtpConfig()).toBeNull();
  });

  it('returns the config on success', async () => {
    const config = {
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      fromAddress: 'noreply@congtyb.vn',
      status: 'CONNECTED',
    };
    apiRequest.mockResolvedValueOnce(config);

    expect(await fetchSmtpConfig()).toEqual(config);
  });

  it('rethrows any non-404 error', async () => {
    const error = { response: { status: 500 } };
    apiRequest.mockRejectedValueOnce(error);

    await expect(fetchSmtpConfig()).rejects.toBe(error);
  });
});
