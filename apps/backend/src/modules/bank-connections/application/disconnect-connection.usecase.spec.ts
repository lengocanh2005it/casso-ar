import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import { DisconnectConnectionUseCase } from './disconnect-connection.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    encryptedSecureToken: 'encrypted-secure-token',
    encryptedCassoApiKey: encryptToken('raw-api-key', encryptionKey),
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

describe('DisconnectConnectionUseCase', () => {
  it('invalidates the token and persists the disconnected connection', async () => {
    const connection = activeConnection();
    const bankConnectionRepo = {
      findById: jest.fn().mockResolvedValue(connection),
      findByIdForUpdate: jest.fn().mockResolvedValue(connection),
      save: jest.fn(),
    };
    const adapter = { invalidateToken: jest.fn().mockResolvedValue(undefined) };
    const auditEventRepo = { save: jest.fn() };
    const markRequiresReauthorization = { handleAdapterError: jest.fn() };
    const auditContext = { setBefore: jest.fn() };
    const useCase = new DisconnectConnectionUseCase(
      bankConnectionRepo as never,
      adapter as never,
      auditEventRepo as never,
      markRequiresReauthorization as never,
      dataSource as never,
      encryptionKey,
      auditContext as never,
    );

    await useCase.execute('conn-1');

    expect(adapter.invalidateToken).toHaveBeenCalled();
    expect(auditContext.setBefore).toHaveBeenCalledWith(connection);
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISCONNECTED' }),
      expect.anything(),
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        bankConnectionId: 'conn-1',
        eventType: 'DISCONNECTED',
      }),
      expect.anything(),
    );
    expect(bankConnectionRepo.findByIdForUpdate).toHaveBeenCalledWith(
      'conn-1',
      expect.anything(),
    );
    expect(
      markRequiresReauthorization.handleAdapterError,
    ).not.toHaveBeenCalled();
  });

  it('marks the connection as requiring reauthorization and rethrows on a 401/403, without persisting a disconnect', async () => {
    const connection = activeConnection();
    const bankConnectionRepo = {
      findById: jest.fn().mockResolvedValue(connection),
      save: jest.fn(),
    };
    const adapter = {
      invalidateToken: jest
        .fn()
        .mockRejectedValue(new CasIdUnauthorizedError()),
    };
    const auditEventRepo = { save: jest.fn() };
    const markRequiresReauthorization = {
      handleAdapterError: jest
        .fn()
        .mockImplementation((_id: string, _reason: string, error: unknown) => {
          throw error;
        }),
    };
    const useCase = new DisconnectConnectionUseCase(
      bankConnectionRepo as never,
      adapter as never,
      auditEventRepo as never,
      markRequiresReauthorization as never,
      dataSource as never,
      encryptionKey,
      { setBefore: jest.fn() } as never,
    );

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(
      CasIdUnauthorizedError,
    );
    expect(markRequiresReauthorization.handleAdapterError).toHaveBeenCalledWith(
      'conn-1',
      '401/403 from invalidateToken',
      expect.any(CasIdUnauthorizedError),
    );
    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(auditEventRepo.save).not.toHaveBeenCalled();
  });

  it('throws AppError when the connection cannot be found', async () => {
    const bankConnectionRepo = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = new DisconnectConnectionUseCase(
      bankConnectionRepo as never,
      { invalidateToken: jest.fn() } as never,
      { save: jest.fn() } as never,
      { handleAdapterError: jest.fn() } as never,
      dataSource as never,
      encryptionKey,
      { setBefore: jest.fn() } as never,
    );

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('throws AppError if the connection disappears between the unlocked read and the locked re-read', async () => {
    const connection = activeConnection();
    const bankConnectionRepo = {
      findById: jest.fn().mockResolvedValue(connection),
      findByIdForUpdate: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = new DisconnectConnectionUseCase(
      bankConnectionRepo as never,
      { invalidateToken: jest.fn().mockResolvedValue(undefined) } as never,
      { save: jest.fn() } as never,
      { handleAdapterError: jest.fn() } as never,
      dataSource as never,
      encryptionKey,
      { setBefore: jest.fn() } as never,
    );

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(AppError);
  });
});
