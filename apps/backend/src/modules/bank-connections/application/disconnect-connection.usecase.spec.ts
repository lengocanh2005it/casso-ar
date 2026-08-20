import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port';
import { DisconnectConnectionUseCase } from './disconnect-connection.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const realSecret = 'the-real-secret';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    accountHolderName: 'MOCK NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function authorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: encryptToken('raw-api-key', encryptionKey),
    encryptedSecureToken: encryptToken(realSecret, encryptionKey),
    createdAt: new Date(),
  });
}

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function buildUseCase(overrides: {
  bankConnectionRepo?: Record<string, jest.Mock>;
  authorizationRepo?: Record<string, jest.Mock>;
  adapter?: Record<string, jest.Mock>;
  markRequiresReauthorization?: Record<string, jest.Mock>;
}) {
  const connection = activeConnection();
  const bankConnectionRepo = {
    findById: jest.fn().mockResolvedValue(connection),
    findByIdForUpdate: jest.fn().mockResolvedValue(connection),
    countActiveByAuthorization: jest.fn().mockResolvedValue(0),
    save: jest.fn(),
    ...overrides.bankConnectionRepo,
  };
  const authorizationRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(authorization()),
    ...overrides.authorizationRepo,
  };
  const adapter = {
    invalidateToken: jest.fn().mockResolvedValue(undefined),
    ...overrides.adapter,
  };
  const auditEventRepo = { save: jest.fn() };
  const markRequiresReauthorization = {
    handleAdapterError: jest.fn(),
    ...overrides.markRequiresReauthorization,
  };
  const auditContext = { setBefore: jest.fn() };
  const useCase = new DisconnectConnectionUseCase(
    bankConnectionRepo as never,
    adapter as never,
    auditEventRepo as never,
    markRequiresReauthorization as never,
    dataSource as never,
    encryptionKey,
    auditContext as never,
    authorizationRepo as never,
  );
  return {
    useCase,
    bankConnectionRepo,
    authorizationRepo,
    adapter,
    auditEventRepo,
    markRequiresReauthorization,
    auditContext,
  };
}

describe('DisconnectConnectionUseCase', () => {
  it('disconnects and persists without invalidating the token when sibling connections remain active', async () => {
    const { useCase, bankConnectionRepo, adapter, auditEventRepo } =
      buildUseCase({
        bankConnectionRepo: {
          countActiveByAuthorization: jest.fn().mockResolvedValue(2),
        },
      });

    await useCase.execute('conn-1');

    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISCONNECTED' }),
      expect.anything(),
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'DISCONNECTED' }),
      expect.anything(),
    );
    expect(adapter.invalidateToken).not.toHaveBeenCalled();
  });

  it('invalidates the authorization token when this was the last active account under it', async () => {
    const { useCase, adapter } = buildUseCase({
      bankConnectionRepo: {
        countActiveByAuthorization: jest.fn().mockResolvedValue(0),
      },
    });

    await useCase.execute('conn-1');

    expect(adapter.invalidateToken).toHaveBeenCalledWith('raw-api-key');
  });

  it('marks requiring reauthorization and rethrows on a 401/403 from invalidateToken, without undoing the already-persisted disconnect', async () => {
    const markRequiresReauthorization = {
      handleAdapterError: jest
        .fn()
        .mockImplementation((_id: string, _reason: string, error: unknown) => {
          throw error;
        }),
    };
    const { useCase, bankConnectionRepo } = buildUseCase({
      bankConnectionRepo: {
        countActiveByAuthorization: jest.fn().mockResolvedValue(0),
      },
      adapter: {
        invalidateToken: jest
          .fn()
          .mockRejectedValue(new CassoFlowUnauthorizedError()),
      },
      markRequiresReauthorization,
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(
      CassoFlowUnauthorizedError,
    );
    expect(markRequiresReauthorization.handleAdapterError).toHaveBeenCalledWith(
      'conn-1',
      '401/403 from invalidateToken',
      expect.any(CassoFlowUnauthorizedError),
    );
    // the disconnect itself already committed before invalidateToken ran
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISCONNECTED' }),
      expect.anything(),
    );
  });

  it('throws AppError when the connection cannot be found', async () => {
    const { useCase } = buildUseCase({
      bankConnectionRepo: { findById: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('throws AppError if the connection disappears between the unlocked read and the locked re-read', async () => {
    const { useCase } = buildUseCase({
      bankConnectionRepo: {
        findByIdForUpdate: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(AppError);
  });
});
