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

  it('initiates a first connection session for the current tenant', async () => {
    const previousAllowlist = process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
    process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = 'http://localhost';
    const sessionRepo = { save: jest.fn() };
    const auditRepo = { save: jest.fn() };
    const useCase = new InitiateConnectionUseCase(
      {
        createGrantToken: jest.fn().mockResolvedValue({
          grantToken: 'grant',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      } as never,
      sessionRepo as never,
      { findById: jest.fn() } as never,
      auditRepo as never,
      { getOrganizationId: () => 'org-1' } as never,
      dataSource as never,
    );

    try {
      const result = await useCase.execute({
        userId: 'user-1',
        redirectUri: 'http://localhost/callback',
      });
      expect(result.grantToken).toBe('grant');
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          status: 'PENDING_AUTHORIZATION',
        }),
        expect.anything(),
      );
      expect(auditRepo.save).not.toHaveBeenCalled();
    } finally {
      if (previousAllowlist === undefined) {
        delete process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
      } else {
        process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = previousAllowlist;
      }
    }
  });

  it('rejects a redirect URI outside the configured allowlist before Cas ID', async () => {
    const previousAllowlist = process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
    process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = 'https://app.casso.vn';
    const createGrantToken = jest.fn();
    const useCase = new InitiateConnectionUseCase(
      { createGrantToken } as never,
      { save: jest.fn() } as never,
      { findById: jest.fn() } as never,
      { save: jest.fn() } as never,
      { getOrganizationId: () => 'org-1' } as never,
      dataSource as never,
    );

    try {
      await expect(
        useCase.execute({
          userId: 'user-1',
          redirectUri: 'https://evil.example/callback',
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
      expect(createGrantToken).not.toHaveBeenCalled();
    } finally {
      if (previousAllowlist === undefined) {
        delete process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
      } else {
        process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = previousAllowlist;
      }
    }
  });

  it('accepts a redirect URI on a configured origin', async () => {
    const previousAllowlist = process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
    process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = 'https://app.casso.vn';
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
      await expect(
        useCase.execute({
          userId: 'user-1',
          redirectUri: 'https://app.casso.vn/cas/callback',
        }),
      ).resolves.toMatchObject({ grantToken: 'grant' });
      expect(sessionRepo.save).toHaveBeenCalled();
    } finally {
      if (previousAllowlist === undefined) {
        delete process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
      } else {
        process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = previousAllowlist;
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
