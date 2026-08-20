import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port';
import { SyncTransactionsUseCase } from './sync-transactions.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    encryptedSecureToken: 'encrypted-secure-token',
    createdAt: new Date(),
  });
}

function buildUseCase(overrides: {
  bankConnectionRepo?: Record<string, jest.Mock>;
  authorizationRepo?: Record<string, jest.Mock>;
  adapter?: Record<string, jest.Mock>;
  markRequiresReauthorization?: Record<string, jest.Mock>;
}) {
  const bankConnectionRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(activeConnection()),
    ...overrides.bankConnectionRepo,
  };
  const authorizationRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(authorization()),
    ...overrides.authorizationRepo,
  };
  const adapter = {
    getTransactions: jest.fn().mockResolvedValue([]),
    ...overrides.adapter,
  };
  const markRequiresReauthorization = {
    handleAdapterError: jest.fn(),
    ...overrides.markRequiresReauthorization,
  };
  const useCase = new SyncTransactionsUseCase(
    adapter as never,
    bankConnectionRepo as never,
    markRequiresReauthorization as never,
    encryptionKey,
    authorizationRepo as never,
  );
  return {
    useCase,
    bankConnectionRepo,
    authorizationRepo,
    adapter,
    markRequiresReauthorization,
  };
}

describe('SyncTransactionsUseCase', () => {
  it('returns transactions fetched from the adapter using the authorization API Key', async () => {
    const { useCase, adapter, markRequiresReauthorization } = buildUseCase({});

    const result = await useCase.execute('conn-1');

    expect(result).toEqual([]);
    expect(adapter.getTransactions).toHaveBeenCalledWith('raw-api-key');
    expect(
      markRequiresReauthorization.handleAdapterError,
    ).not.toHaveBeenCalled();
  });

  it('marks the connection as requiring reauthorization and rethrows on a 401/403 from Casso Flow', async () => {
    const markRequiresReauthorization = {
      handleAdapterError: jest
        .fn()
        .mockImplementation((_id: string, _reason: string, error: unknown) => {
          throw error;
        }),
    };
    const { useCase } = buildUseCase({
      adapter: {
        getTransactions: jest
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
      '401/403 from getTransactions',
      expect.any(CassoFlowUnauthorizedError),
    );
  });

  it('throws AppError when the connection cannot be found', async () => {
    const { useCase } = buildUseCase({
      bankConnectionRepo: {
        findByIdUnscoped: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const { useCase } = buildUseCase({
      authorizationRepo: {
        findByIdUnscoped: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(AppError);
  });
});
