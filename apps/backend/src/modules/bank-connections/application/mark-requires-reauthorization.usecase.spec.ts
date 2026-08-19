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
    grantId: 'grant-1',
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

function buildUseCase(
  bankConnectionRepo: Record<string, jest.Mock>,
  auditEventRepo: Record<string, jest.Mock>,
  eventPublisher = { emit: jest.fn(), emitAsync: jest.fn() },
) {
  const useCase = new MarkRequiresReauthorizationUseCase(
    bankConnectionRepo as never,
    auditEventRepo as never,
    dataSource as never,
    eventPublisher as never,
  );
  return { useCase, eventPublisher };
}

describe('MarkRequiresReauthorizationUseCase', () => {
  it('marks an ACTIVE connection as requiring reauthorization, audits, and emits the status-changed event', async () => {
    const connection = connectionWithStatus('ACTIVE');
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(connection),
      save: jest.fn(),
    };
    const auditEventRepo = { save: jest.fn() };
    const { useCase, eventPublisher } = buildUseCase(
      bankConnectionRepo,
      auditEventRepo,
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
    expect(eventPublisher.emit).toHaveBeenCalledWith(
      'bank-connection.status.changed',
      {
        bankConnectionId: 'conn-1',
        organizationId: 'org-1',
        status: 'REQUIRES_REAUTHORIZATION',
      },
    );
  });

  it('only logs the failed-call audit event when the connection is not ACTIVE', async () => {
    const connection = connectionWithStatus('REQUIRES_REAUTHORIZATION');
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(connection),
      save: jest.fn(),
    };
    const auditEventRepo = { save: jest.fn() };
    const { useCase, eventPublisher } = buildUseCase(
      bankConnectionRepo,
      auditEventRepo,
    );

    await useCase.execute('conn-1', '401 from getTransactions');

    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'API_CALL_FAILED_401' }),
      expect.anything(),
    );
    expect(eventPublisher.emit).not.toHaveBeenCalled();
  });

  it('does nothing when the connection cannot be found', async () => {
    const bankConnectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const auditEventRepo = { save: jest.fn() };
    const { useCase, eventPublisher } = buildUseCase(
      bankConnectionRepo,
      auditEventRepo,
    );

    await useCase.execute('missing', 'reason');

    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(auditEventRepo.save).not.toHaveBeenCalled();
    expect(eventPublisher.emit).not.toHaveBeenCalled();
  });

  describe('handleAdapterError', () => {
    it('marks the connection and rethrows on a CasIdUnauthorizedError', async () => {
      const connection = connectionWithStatus('ACTIVE');
      const bankConnectionRepo = {
        findByIdUnscoped: jest.fn().mockResolvedValue(connection),
        save: jest.fn(),
      };
      const auditEventRepo = { save: jest.fn() };
      const { useCase, eventPublisher } = buildUseCase(
        bankConnectionRepo,
        auditEventRepo,
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
      expect(eventPublisher.emit).toHaveBeenCalledWith(
        'bank-connection.status.changed',
        expect.objectContaining({
          status: 'REQUIRES_REAUTHORIZATION',
        }),
      );
    });

    it('marks the connection ERROR, audits, emits, and rethrows on any other adapter failure', async () => {
      const connection = connectionWithStatus('ACTIVE');
      const bankConnectionRepo = {
        findByIdUnscoped: jest.fn().mockResolvedValue(connection),
        save: jest.fn(),
      };
      const auditEventRepo = { save: jest.fn() };
      const { useCase, eventPublisher } = buildUseCase(
        bankConnectionRepo,
        auditEventRepo,
      );
      const error = new Error('network timeout');

      await expect(
        useCase.handleAdapterError('conn-1', 'timeout', error),
      ).rejects.toBe(error);

      expect(bankConnectionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ERROR' }),
        expect.anything(),
      );
      expect(auditEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MARKED_ERROR',
          metadata: { reason: 'timeout' },
        }),
        expect.anything(),
      );
      expect(eventPublisher.emit).toHaveBeenCalledWith(
        'bank-connection.status.changed',
        {
          bankConnectionId: 'conn-1',
          organizationId: 'org-1',
          status: 'ERROR',
        },
      );
    });

    it('only logs the failed-call audit event when a non-401 error hits a non-ACTIVE connection', async () => {
      const connection = connectionWithStatus('REQUIRES_REAUTHORIZATION');
      const bankConnectionRepo = {
        findByIdUnscoped: jest.fn().mockResolvedValue(connection),
        save: jest.fn(),
      };
      const auditEventRepo = { save: jest.fn() };
      const { useCase, eventPublisher } = buildUseCase(
        bankConnectionRepo,
        auditEventRepo,
      );
      const error = new Error('network timeout');

      await expect(
        useCase.handleAdapterError('conn-1', 'timeout', error),
      ).rejects.toBe(error);

      expect(bankConnectionRepo.save).not.toHaveBeenCalled();
      expect(auditEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'API_CALL_FAILED' }),
        expect.anything(),
      );
      expect(eventPublisher.emit).not.toHaveBeenCalled();
    });
  });
});
