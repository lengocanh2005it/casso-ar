import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { ExchangeTokenUseCase } from './exchange-token.usecase';
import { InitiateConnectionUseCase } from './initiate-connection.usecase';

describe('bank connection use cases', () => {
  beforeEach(() => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: object) => Promise<unknown>) => callback({}),
    ),
  };

  it('initiates a first connection session for the current tenant', async () => {
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
    const bankRepo = { findByIdForUpdate: jest.fn(), save: jest.fn() };
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
    );

    await expect(
      useCase.execute({ sessionId: 'session-1', publicToken: 'public' }),
    ).rejects.toThrow();

    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED' }),
      expect.anything(),
    );
  });
});
