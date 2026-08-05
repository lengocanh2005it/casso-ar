import { BankConnection } from '../domain/bank-connection';
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';

function connectionWithStatus(
  status: BankConnection['status'],
): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    casIdConnectionSessionId: 'session-1',
    encryptedAccessToken: 'encrypted',
    accountIdentity: { accountNumber: '0011002233', bankName: 'Mock Bank' },
    status,
    scopes: ['identity', 'transaction'],
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

describe('MarkRequiresReauthorizationUseCase', () => {
  it('marks an ACTIVE connection as requiring reauthorization and logs the audit event', async () => {
    const connection = connectionWithStatus('ACTIVE');
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(connection),
      save: jest.fn(),
    };
    const auditEventRepo = { save: jest.fn() };
    const useCase = new MarkRequiresReauthorizationUseCase(
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
    );

    await useCase.execute('conn-1', '401 from getTransactions');

    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REQUIRES_REAUTHORIZATION' }),
      expect.anything(),
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        bankConnectionId: 'conn-1',
        eventType: 'MARKED_REQUIRES_REAUTH',
        metadata: { reason: '401 from getTransactions' },
      }),
      expect.anything(),
    );
  });

  it('only logs the failed-call audit event when the connection is not ACTIVE', async () => {
    const connection = connectionWithStatus('REQUIRES_REAUTHORIZATION');
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(connection),
      save: jest.fn(),
    };
    const auditEventRepo = { save: jest.fn() };
    const useCase = new MarkRequiresReauthorizationUseCase(
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
    );

    await useCase.execute('conn-1', '401 from getTransactions');

    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'API_CALL_FAILED_401' }),
      expect.anything(),
    );
  });

  it('does nothing when the connection cannot be found', async () => {
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const auditEventRepo = { save: jest.fn() };
    const useCase = new MarkRequiresReauthorizationUseCase(
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
    );

    await useCase.execute('missing', 'reason');

    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(auditEventRepo.save).not.toHaveBeenCalled();
  });

  describe('handleAdapterError', () => {
    it('marks the connection and rethrows on a CasIdUnauthorizedError', async () => {
      const connection = connectionWithStatus('ACTIVE');
      const bankConnectionRepo = {
        findByIdUnscoped: jest.fn().mockResolvedValue(connection),
        save: jest.fn(),
      };
      const auditEventRepo = { save: jest.fn() };
      const useCase = new MarkRequiresReauthorizationUseCase(
        bankConnectionRepo as never,
        auditEventRepo as never,
        dataSource as never,
      );
      const error = new CasIdUnauthorizedError();

      await expect(
        useCase.handleAdapterError(
          'conn-1',
          '401/403 from getTransactions',
          error,
        ),
      ).rejects.toBe(error);

      expect(bankConnectionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REQUIRES_REAUTHORIZATION' }),
        expect.anything(),
      );
    });

    it('rethrows without marking the connection on any other error', async () => {
      const bankConnectionRepo = {
        findByIdUnscoped: jest.fn(),
        save: jest.fn(),
      };
      const auditEventRepo = { save: jest.fn() };
      const useCase = new MarkRequiresReauthorizationUseCase(
        bankConnectionRepo as never,
        auditEventRepo as never,
        dataSource as never,
      );
      const error = new Error('network timeout');

      await expect(
        useCase.handleAdapterError('conn-1', 'timeout', error),
      ).rejects.toBe(error);

      expect(bankConnectionRepo.findByIdUnscoped).not.toHaveBeenCalled();
    });
  });
});
