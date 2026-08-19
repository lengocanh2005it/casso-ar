import { CasIdAdapter } from './cas-id.adapter';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('CasIdAdapter', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CAS_ID_BASE_URL: 'https://sandbox.bankhub.dev',
      CAS_ID_CLIENT_ID: 'test-client',
      CAS_ID_CLIENT_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('creates a grant token by calling POST /grant/token with the right headers and body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        grantToken: 'real-grant',
        expiresAt: '2026-08-19T12:30:00.000Z',
      }),
    );
    global.fetch = fetchMock as never;
    const adapter = new CasIdAdapter();

    const result = await adapter.createGrantToken(
      ['identity', 'transaction'],
      'http://localhost:5173/bank-connections/cas-id/callback?sessionId=s1',
    );

    expect(result.grantToken).toBe('real-grant');
    expect(result.expiresAt).toEqual(new Date('2026-08-19T12:30:00.000Z'));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.bankhub.dev/grant/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-client-id': 'test-client',
          'x-secret-key': 'test-secret',
          'X-BankHub-Api-Version': '2023-01-01',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          scopes: 'identity,transaction',
          language: 'vi',
          redirectUri:
            'http://localhost:5173/bank-connections/cas-id/callback?sessionId=s1',
        }),
      }),
    );
  });

  it('maps snake_case response fields as a fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        grant_token: 'snake-grant',
        expires_at: '2026-08-19T12:30:00.000Z',
      }),
    ) as never;
    const adapter = new CasIdAdapter();

    const result = await adapter.createGrantToken([], 'http://localhost/cb');

    expect(result.grantToken).toBe('snake-grant');
  });

  it('throws if the response is missing grantToken', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {})) as never;
    const adapter = new CasIdAdapter();

    await expect(
      adapter.createGrantToken([], 'http://localhost/cb'),
    ).rejects.toThrow('Cas ID /grant/token response is missing grantToken');
  });

  it('retries on a 503 and succeeds on the second attempt', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: 'unavailable' }))
      .mockResolvedValueOnce(jsonResponse(200, { grantToken: 'after-retry' }));
    global.fetch = fetchMock as never;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
    ) => {
      fn();
      return 0 as never;
    }) as never);
    const adapter = new CasIdAdapter();

    const result = await adapter.createGrantToken([], 'http://localhost/cb');

    expect(result.grantToken).toBe('after-retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-retryable 400 and throws with the mapped message', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { errorMessage: 'invalid scopes' }));
    global.fetch = fetchMock as never;
    const adapter = new CasIdAdapter();

    await expect(
      adapter.createGrantToken([], 'http://localhost/cb'),
    ).rejects.toThrow('invalid scopes');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('exchangeToken', () => {
    it('exchanges a public token for an accessToken and grantId', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          accessToken: 'real-access',
          grantId: 'real-grant-id',
        }),
      );
      global.fetch = fetchMock as never;
      const adapter = new CasIdAdapter();

      const result = await adapter.exchangeToken('public-token-1');

      expect(result).toEqual({
        accessToken: 'real-access',
        grantId: 'real-grant-id',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://sandbox.bankhub.dev/grant/exchange',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ publicToken: 'public-token-1' }),
        }),
      );
    });

    it('maps snake_case response fields as a fallback', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          access_token: 'snake-access',
          grant_id: 'snake-grant',
        }),
      ) as never;
      const adapter = new CasIdAdapter();

      const result = await adapter.exchangeToken('public-token-1');

      expect(result).toEqual({
        accessToken: 'snake-access',
        grantId: 'snake-grant',
      });
    });

    it('throws if the response is missing grantId', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { accessToken: 'real-access' }),
        ) as never;
      const adapter = new CasIdAdapter();

      await expect(adapter.exchangeToken('public-token-1')).rejects.toThrow(
        'Cas ID /grant/exchange response is missing grantId',
      );
    });

    it('throws CasIdUnauthorizedError on a 401', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(401, {})) as never;
      const adapter = new CasIdAdapter();

      await expect(adapter.exchangeToken('public-token-1')).rejects.toThrow(
        'Cas ID access token rejected',
      );
    });
  });

  describe('getAccountIdentity', () => {
    it('fetches identity with the access token as the raw Authorization header value', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          accountNumber: '867623232',
          bankName: 'VietinBank',
        }),
      );
      global.fetch = fetchMock as never;
      const adapter = new CasIdAdapter();

      const result = await adapter.getAccountIdentity('access-token-1');

      expect(result).toEqual(
        expect.objectContaining({
          accountNumber: '867623232',
          bankName: 'VietinBank',
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://sandbox.bankhub.dev/identity',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'access-token-1' }),
        }),
      );
    });

    it('throws if accountNumber or bankName is missing', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { bankName: 'VietinBank' }),
        ) as never;
      const adapter = new CasIdAdapter();

      await expect(
        adapter.getAccountIdentity('access-token-1'),
      ).rejects.toThrow('Cas ID /identity response is missing accountNumber');
    });

    it('throws CasIdUnauthorizedError on a 403', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(403, {})) as never;
      const adapter = new CasIdAdapter();

      await expect(
        adapter.getAccountIdentity('access-token-1'),
      ).rejects.toThrow('Cas ID access token rejected');
    });
  });
});
