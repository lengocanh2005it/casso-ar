import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import { SyncTransactionsUseCase } from './sync-transactions.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
    encryptedAccessToken: encryptToken('raw-access-token', encryptionKey),
    accountIdentity: { accountNumber: '0011002233', bankName: 'Mock Bank' },
    status: 'ACTIVE',
    scopes: ['identity', 'transaction'],
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('SyncTransactionsUseCase', () => {
  it('returns transactions fetched from the adapter', async () => {
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(activeConnection()),
    };
    const adapter = { getTransactions: jest.fn().mockResolvedValue([]) };
    const markRequiresReauthorization = { handleAdapterError: jest.fn() };
    const useCase = new SyncTransactionsUseCase(
      adapter as never,
      bankConnectionRepo as never,
      markRequiresReauthorization as never,
      encryptionKey,
    );

    const result = await useCase.execute('conn-1');

    expect(result).toEqual([]);
    expect(
      markRequiresReauthorization.handleAdapterError,
    ).not.toHaveBeenCalled();
  });

  it('marks the connection as requiring reauthorization and rethrows on a 401/403 from Cas ID', async () => {
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(activeConnection()),
    };
    const adapter = {
      getTransactions: jest
        .fn()
        .mockRejectedValue(new CasIdUnauthorizedError()),
    };
    const markRequiresReauthorization = {
      handleAdapterError: jest
        .fn()
        .mockImplementation((_id: string, _reason: string, error: unknown) => {
          throw error;
        }),
    };
    const useCase = new SyncTransactionsUseCase(
      adapter as never,
      bankConnectionRepo as never,
      markRequiresReauthorization as never,
      encryptionKey,
    );

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(
      CasIdUnauthorizedError,
    );
    expect(markRequiresReauthorization.handleAdapterError).toHaveBeenCalledWith(
      'conn-1',
      '401/403 from getTransactions',
      expect.any(CasIdUnauthorizedError),
    );
  });

  it('throws AppError when the connection cannot be found', async () => {
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(null),
    };
    const useCase = new SyncTransactionsUseCase(
      { getTransactions: jest.fn() } as never,
      bankConnectionRepo as never,
      { handleAdapterError: jest.fn() } as never,
      encryptionKey,
    );

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(AppError);
  });
});
