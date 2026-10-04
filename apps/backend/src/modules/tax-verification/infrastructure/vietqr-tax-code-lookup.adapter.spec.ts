import type { ConfigService } from '@nestjs/config';
import { VietQrTaxCodeLookupAdapter } from './vietqr-tax-code-lookup.adapter';

function buildConfig(): ConfigService {
  return {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  } as unknown as ConfigService;
}

describe('VietQrTaxCodeLookupAdapter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns the cached name without calling fetch on a cache hit', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ name: 'CACHED CO' })),
      set: jest.fn(),
    };
    global.fetch = jest.fn();
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toEqual({ name: 'CACHED CO' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches, caches, and returns the name on a cache miss', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '0101234567', name: 'ACME CO' }),
    });
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toEqual({ name: 'ACME CO' });
    expect(redis.set).toHaveBeenCalledWith(
      'tax-code-lookup:0101234567',
      JSON.stringify({ name: 'ACME CO' }),
      'EX',
      30 * 24 * 60 * 60,
    );
  });

  it('returns null and does not cache when VietQR responds with a non-OK status', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws (network error/timeout)', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toBeNull();
  });
});
