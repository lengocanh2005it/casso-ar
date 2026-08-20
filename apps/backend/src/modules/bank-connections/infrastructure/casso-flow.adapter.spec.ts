import { CassoFlowAdapter } from './casso-flow.adapter';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

// Real response captured from a live GET /v2/userInfo call during
// implementation (see issue #271 / PR #270 review) — the earlier draft of
// this adapter assumed a flat { accountNumber, bankName } shape that does
// not exist on the real API; the account lives under data.bankAccs[].
function userInfoResponse(bankAccs: unknown[]) {
  return {
    error: 0,
    message: 'success',
    data: {
      user: { id: 20841, email: 'test@example.com' },
      business: { id: 17122, name: 'Test Business' },
      bankAccs,
    },
  };
}

const realBankAcc = {
  id: 16608,
  bank: {
    id: 172,
    bin: 970422,
    swift: '',
    codeName: 'mbbank',
    fullName: 'Ngân hàng TMCP Quân đội',
    bankType: 'personal',
  },
  bankAccountName: 'LE NGOC ANH',
  bankSubAccId: '0393873630',
  balance: null,
  memo: '',
  connectStatus: 1,
  planStatus: 0,
  beginDate: '2026-08-19',
};

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
    it('reads businessId and every linked bank account from bankAccs', async () => {
      const secondBankAcc = {
        ...realBankAcc,
        id: 16609,
        bank: { ...realBankAcc.bank, fullName: 'VPBank' },
        bankAccountName: 'TRAN THI B',
        bankSubAccId: '88888888',
      };
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, userInfoResponse([realBankAcc, secondBankAcc])),
        );
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result).toEqual({
        businessId: '17122',
        accounts: [
          {
            accountNumber: '0393873630',
            bankName: 'Ngân hàng TMCP Quân đội',
            accountHolderName: 'LE NGOC ANH',
          },
          {
            accountNumber: '88888888',
            bankName: 'VPBank',
            accountHolderName: 'TRAN THI B',
          },
        ],
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/userInfo');
      expect(init.headers.Authorization).toBe('Apikey test-api-key');
    });

    it('defaults accountHolderName to an empty string when Casso Flow omits it', async () => {
      const accWithoutHolderName = {
        ...realBankAcc,
        bankAccountName: undefined,
      };
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, userInfoResponse([accWithoutHolderName])),
        ) as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result.accounts[0]?.accountHolderName).toBe('');
    });

    it('throws if bankAccs is empty (no bank account linked yet)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, userInfoResponse([]))) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('test-api-key')).rejects.toThrow(
        'no linked bank account',
      );
    });

    it('throws if business.id is missing', async () => {
      const responseWithoutBusiness = {
        error: 0,
        message: 'success',
        data: {
          user: { id: 20841, email: 'test@example.com' },
          bankAccs: [realBankAcc],
        },
      };
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, responseWithoutBusiness)) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('test-api-key')).rejects.toThrow(
        'business.id',
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
          jsonResponse(200, userInfoResponse([realBankAcc])),
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

      expect(result.accounts[0]?.accountNumber).toBe('0393873630');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
