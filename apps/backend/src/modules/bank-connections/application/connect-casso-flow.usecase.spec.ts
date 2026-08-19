import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { ConnectCassoFlowUseCase } from './connect-casso-flow.usecase';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

describe('ConnectCassoFlowUseCase', () => {
  it('reads account info, registers a webhook, and creates the connection', async () => {
    const bankConnectionRepo = {
      findActiveOrReauthorizableByOrganizationForUpdate: jest
        .fn()
        .mockResolvedValue(null),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(0),
    };
    const auditEventRepo = { save: jest.fn() };
    const adapter = {
      getAccountInfo: jest
        .fn()
        .mockResolvedValue({ accountNumber: '0011002233', bankName: 'VPBank' }),
      registerWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConnectCassoFlowUseCase(
      adapter as never,
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.accountNumber).toBe('0011002233');
    expect(adapter.getAccountInfo).toHaveBeenCalledWith('real-api-key');
    expect(adapter.registerWebhook).toHaveBeenCalledWith(
      'real-api-key',
      expect.any(String),
    );
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', status: 'ACTIVE' }),
      expect.anything(),
    );
  });

  it('reactivates an existing REQUIRES_REAUTHORIZATION connection instead of creating a new one', async () => {
    const existing = new BankConnection({
      id: 'conn-1',
      organizationId: 'org-1',
      accountNumber: '0011002233',
      bankName: 'Old Bank',
      encryptedSecureToken: 'old-secure-token',
      encryptedCassoApiKey: 'old-api-key',
      status: 'REQUIRES_REAUTHORIZATION',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    const bankConnectionRepo = {
      findActiveOrReauthorizableByOrganizationForUpdate: jest
        .fn()
        .mockResolvedValue(existing),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(0),
    };
    const auditEventRepo = { save: jest.fn() };
    const adapter = {
      getAccountInfo: jest
        .fn()
        .mockResolvedValue({ accountNumber: '0011002233', bankName: 'VPBank' }),
      registerWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConnectCassoFlowUseCase(
      adapter as never,
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'new-api-key',
      bankConnectionId: 'conn-1',
    });

    expect(result.id).toBe('conn-1');
    expect(result.status).toBe('ACTIVE');
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'RECONNECTED' }),
      expect.anything(),
    );
  });

  it('propagates a CassoFlowUnauthorizedError for an invalid API Key without persisting anything', async () => {
    const bankConnectionRepo = {
      findActiveOrReauthorizableByOrganizationForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const adapter = {
      getAccountInfo: jest
        .fn()
        .mockRejectedValue(new Error('Casso Flow API Key rejected')),
    };
    const useCase = new ConnectCassoFlowUseCase(
      adapter as never,
      bankConnectionRepo as never,
      { save: jest.fn() } as never,
      dataSource as never,
      encryptionKey,
      {} as never,
    );

    await expect(
      useCase.execute({ organizationId: 'org-1', apiKey: 'bad-key' }),
    ).rejects.toThrow('Casso Flow API Key rejected');
    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
  });
});
