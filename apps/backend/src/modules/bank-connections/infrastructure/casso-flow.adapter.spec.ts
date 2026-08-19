import { CassoFlowAdapter } from './casso-flow.adapter';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('CassoFlowAdapter', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CASSO_FLOW_WEBHOOK_URL:
        'http://localhost:3000/api/v1/webhooks/casso-balance-hook',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('getAccountInfo', () => {
    it('fetches account number and bank name with the Apikey header', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          data: { accountNumber: '867623232', bankName: 'VPBank' },
        }),
      );
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result).toEqual({
        accountNumber: '867623232',
        bankName: 'VPBank',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/userInfo');
      expect(init.headers.Authorization).toBe('Apikey test-api-key');
    });

    it('throws if accountNumber is missing', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: { bankName: 'VPBank' } }),
        ) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('test-api-key')).rejects.toThrow(
        'Casso Flow /v2/userInfo response is missing accountNumber',
      );
    });

    it('throws CassoFlowUnauthorizedError on a 401', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(401, {})) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('bad-key')).rejects.toThrow(
        'Casso Flow API Key rejected',
      );
    });
  });

  describe('registerWebhook', () => {
    it("registers this product's webhook URL with the generated secure token", async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      await adapter.registerWebhook('test-api-key', 'secure-token-1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/webhooks');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Apikey test-api-key');
      expect(JSON.parse(init.body)).toEqual({
        webhook: 'http://localhost:3000/api/v1/webhooks/casso-balance-hook',
        secure_token: 'secure-token-1',
        income_only: true,
      });
    });
  });

  describe('retry', () => {
    it('retries a 503 up to 3 times with backoff', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(503, {}))
        .mockResolvedValueOnce(
          jsonResponse(200, { data: { accountNumber: '1', bankName: 'B' } }),
        );
      global.fetch = fetchMock as never;
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
        fn: () => void,
      ) => {
        fn();
        return 0 as never;
      }) as never);
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result.accountNumber).toBe('1');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
