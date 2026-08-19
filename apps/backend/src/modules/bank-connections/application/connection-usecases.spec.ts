import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BankConnection } from '../domain/bank-connection';
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { ExchangeTokenUseCase } from './exchange-token.usecase';
import { InitiateConnectionUseCase } from './initiate-connection.usecase';

describe('bank connection use cases', () => {
  const encryptionKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: object) => Promise<unknown>) => callback({}),
    ),
  };

  it('initiates a first connection session for the current tenant, embedding the session id in the redirect URI', async () => {
    const sessionRepo = { save: jest.fn() };
    const auditRepo = { save: jest.fn() };
    const createGrantToken = jest.fn().mockResolvedValue({
      grantToken: 'grant',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const useCase = new InitiateConnectionUseCase(
      { createGrantToken } as never,
      sessionRepo as never,
      { findById: jest.fn() } as never,
      auditRepo as never,
      { getOrganizationId: () => 'org-1' } as never,
      dataSource as never,
    );

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.grantToken).toBe('grant');
    expect(result.sessionId).toBeDefined();
    expect(result.redirectUri).toContain(`sessionId=${result.sessionId}`);
    expect(result.linkBaseUrl).toEqual(expect.any(String));
    expect(createGrantToken).toHaveBeenCalledWith(
      expect.any(Array),
      result.redirectUri,
    );
    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        status: 'PENDING_AUTHORIZATION',
        redirectUri: result.redirectUri,
      }),
      expect.anything(),
    );
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('defaults linkBaseUrl to a real, resolvable Cas Link sandbox host', async () => {
    const useCase = new InitiateConnectionUseCase(
      {
        createGrantToken: jest.fn().mockResolvedValue({
          grantToken: 'grant',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      } as never,
      { save: jest.fn() } as never,
      { findById: jest.fn() } as never,
      { save: jest.fn() } as never,
      { getOrganizationId: () => 'org-1' } as never,
      dataSource as never,
    );

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.linkBaseUrl).toBe('https://dev.link.bankhub.dev');
  });

  it('uses CAS_ID_REDIRECT_BASE_URL and CAS_ID_LINK_BASE_URL when configured', async () => {
    const previousRedirectBase = process.env.CAS_ID_REDIRECT_BASE_URL;
    const previousLinkBase = process.env.CAS_ID_LINK_BASE_URL;
    process.env.CAS_ID_REDIRECT_BASE_URL =
      'https://app.casso.vn/bank-connections/cas-id/callback';
    process.env.CAS_ID_LINK_BASE_URL = 'https://link.cas.so';
    const sessionRepo = { save: jest.fn() };
    const useCase = new InitiateConnectionUseCase(
      {
        createGrantToken: jest.fn().mockResolvedValue({
          grantToken: 'grant',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      } as never,
      sessionRepo as never,
      { findById: jest.fn() } as never,
      { save: jest.fn() } as never,
      { getOrganizationId: () => 'org-1' } as never,
      dataSource as never,
    );

    try {
      const result = await useCase.execute({ userId: 'user-1' });
      expect(
        result.redirectUri.startsWith(
          'https://app.casso.vn/bank-connections/cas-id/callback?sessionId=',
        ),
      ).toBe(true);
      expect(result.linkBaseUrl).toBe('https://link.cas.so');
    } finally {
      if (previousRedirectBase === undefined) {
        delete process.env.CAS_ID_REDIRECT_BASE_URL;
      } else {
        process.env.CAS_ID_REDIRECT_BASE_URL = previousRedirectBase;
      }
      if (previousLinkBase === undefined) {
        delete process.env.CAS_ID_LINK_BASE_URL;
      } else {
        process.env.CAS_ID_LINK_BASE_URL = previousLinkBase;
      }
    }
  });

  it('exchanges a public token and persists only encrypted credentials', async () => {
    const session = new CasIdConnectionSession({
      id: 'session-1',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: null,
      grantToken: 'grant',
      scopes: ['identity'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const bankRepo = {
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(0),
    };
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue(session),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest
          .fn()
          .mockResolvedValue({ accessToken: 'raw-secret' }),
        getAccountIdentity: jest
          .fn()
          .mockResolvedValue({ accountNumber: '1234', bankName: 'Mock' }),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({
      sessionId: 'session-1',
      publicToken: 'public',
    });
    expect(result.status).toBe('ACTIVE');
    expect(bankRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      expect.anything(),
    );
    expect(bankRepo.save.mock.calls[0][0].encryptedAccessToken).not.toBe(
      'raw-secret',
    );
    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED' }),
      expect.anything(),
    );
  });

  it('persists EXPIRED status when exchanging an expired session', async () => {
    const session = new CasIdConnectionSession({
      id: 'session-1',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: null,
      grantToken: 'grant',
      scopes: ['identity'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() - 1_000),
      createdAt: new Date(),
    });
    const bankRepo = { findByIdForUpdate: jest.fn(), save: jest.fn() };
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue(session),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest.fn(),
        getAccountIdentity: jest.fn(),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    await expect(
      useCase.execute({ sessionId: 'session-1', publicToken: 'public' }),
    ).rejects.toThrow();

    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED' }),
      expect.anything(),
    );
  });

  it('rejects a new connection when the org is at its ACTIVE bank-connection limit', async () => {
    const session = new CasIdConnectionSession({
      id: 'session-1',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: null,
      grantToken: 'grant',
      scopes: ['identity'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const planLimitError = new AppError(
      ErrorCode.PLAN_LIMIT_EXCEEDED,
      'Đã đạt giới hạn gói FREE; vui lòng nâng cấp để tiếp tục.',
    );
    const bankRepo = {
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(1),
    };
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue(session),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest
          .fn()
          .mockResolvedValue({ accessToken: 'raw-secret' }),
        getAccountIdentity: jest
          .fn()
          .mockResolvedValue({ accountNumber: '1234', bankName: 'Mock' }),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      {
        enforceBankConnectionLimit: jest.fn().mockRejectedValue(planLimitError),
      } as never,
    );

    await expect(
      useCase.execute({ sessionId: 'session-1', publicToken: 'public' }),
    ).rejects.toBe(planLimitError);

    expect(bankRepo.save).not.toHaveBeenCalled();
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('enforces the ACTIVE limit inside the same transaction as the exchange', async () => {
    const session = new CasIdConnectionSession({
      id: 'session-1',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: null,
      grantToken: 'grant',
      scopes: ['identity'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const countActiveByOrganization = jest.fn().mockResolvedValue(0);
    const bankRepo = {
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
      countActiveByOrganization,
    };
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue(session),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const enforceBankConnectionLimit = jest.fn().mockResolvedValue(undefined);
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest
          .fn()
          .mockResolvedValue({ accessToken: 'raw-secret' }),
        getAccountIdentity: jest
          .fn()
          .mockResolvedValue({ accountNumber: '1234', bankName: 'Mock' }),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit } as never,
    );

    const result = await useCase.execute({
      sessionId: 'session-1',
      publicToken: 'public',
    });

    expect(result.status).toBe('ACTIVE');
    expect(enforceBankConnectionLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
    );
    // The deferred count is executed (by the plan-limit service) with the
    // org id + transaction manager — verifying the wiring end to end.
    const countClosure = enforceBankConnectionLimit.mock.calls[0][1];
    await expect(countClosure()).resolves.toBe(0);
    expect(countActiveByOrganization).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
    );
  });

  it('allows re-authenticating a non-ACTIVE connection even at the ACTIVE limit', async () => {
    const session = new CasIdConnectionSession({
      id: 'session-1',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: 'conn-existing',
      grantToken: 'grant',
      scopes: ['identity'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const existing = new BankConnection({
      id: 'conn-existing',
      organizationId: 'org-1',
      casIdConnectionSessionId: 'session-old',
      encryptedAccessToken: 'encrypted',
      accountIdentity: { accountNumber: '0011002233', bankName: 'Mock Bank' },
      status: 'REQUIRES_REAUTHORIZATION',
      scopes: ['identity'],
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    const bankRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(1),
    };
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue(session),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const enforceBankConnectionLimit = jest.fn().mockResolvedValue(undefined);
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest
          .fn()
          .mockResolvedValue({ accessToken: 'raw-secret' }),
        getAccountIdentity: jest
          .fn()
          .mockResolvedValue({ accountNumber: '1234', bankName: 'Mock' }),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit } as never,
    );

    const result = await useCase.execute({
      sessionId: 'session-1',
      publicToken: 'public',
    });

    expect(result.status).toBe('ACTIVE');
    expect(bankRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      expect.anything(),
    );
  });
});
