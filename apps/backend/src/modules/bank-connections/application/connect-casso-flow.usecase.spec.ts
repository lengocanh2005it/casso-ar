import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { ConnectCassoFlowUseCase } from './connect-casso-flow.usecase';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function buildDeps(
  overrides: {
    getAccountInfo?: jest.Mock;
    findByAccountNumbers?: jest.Mock;
    findByBusinessIdForOrganization?: jest.Mock;
    enforceBankConnectionLimit?: jest.Mock;
  } = {},
) {
  const adapter = {
    getAccountInfo:
      overrides.getAccountInfo ??
      jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
        ],
      }),
    registerWebhook: jest.fn().mockResolvedValue(undefined),
  };
  const bankConnectionRepo = {
    findByAccountNumbers:
      overrides.findByAccountNumbers ?? jest.fn().mockResolvedValue(new Map()),
    save: jest.fn(),
    countActiveByOrganization: jest.fn().mockResolvedValue(0),
  };
  const authorizationRepo = {
    findByBusinessIdForOrganization:
      overrides.findByBusinessIdForOrganization ??
      jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const auditEventRepo = { save: jest.fn() };
  const planLimitService = {
    enforceBankConnectionLimit:
      overrides.enforceBankConnectionLimit ??
      jest.fn().mockResolvedValue(undefined),
  };
  return {
    adapter,
    bankConnectionRepo,
    authorizationRepo,
    auditEventRepo,
    planLimitService,
  };
}

describe('ConnectCassoFlowUseCase', () => {
  it('creates a new authorization, registers the webhook once, and connects the selected account', async () => {
    const deps = buildDeps();
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(result.connected).toEqual([
      { connectionId: expect.any(String), accountNumber: '111' },
    ]);
    expect(result.skipped).toEqual([]);
    expect(deps.adapter.registerWebhook).toHaveBeenCalledTimes(1);
    expect(deps.authorizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', businessId: 'biz-1' }),
    );
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        accountNumber: '111',
        status: 'ACTIVE',
      }),
      expect.anything(),
    );
    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TOKEN_EXCHANGED' }),
      expect.anything(),
    );
  });

  it('reuses an existing authorization for the same businessId, without re-registering the webhook', async () => {
    const existingAuthorization = new CassoFlowAuthorization({
      id: 'auth-1',
      organizationId: 'org-1',
      businessId: 'biz-1',
      encryptedApiKey: 'old',
      encryptedSecureToken: 'old',
      createdAt: new Date(),
    });
    const deps = buildDeps({
      findByBusinessIdForOrganization: jest
        .fn()
        .mockResolvedValue(existingAuthorization),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(deps.adapter.registerWebhook).not.toHaveBeenCalled();
    expect(deps.authorizationRepo.save).not.toHaveBeenCalled();
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ cassoFlowAuthorizationId: 'auth-1' }),
      expect.anything(),
    );
  });

  it('skips accounts already taken by another org, without touching the authorization if none are eligible', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
        ],
      }),
      findByAccountNumbers: jest
        .fn()
        .mockResolvedValue(new Map([['111', { organizationId: 'org-OTHER' }]])),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(result.connected).toEqual([]);
    expect(result.skipped).toEqual([
      { accountNumber: '111', reason: 'TAKEN_BY_ANOTHER_ORG' },
    ]);
    expect(deps.adapter.registerWebhook).not.toHaveBeenCalled();
    expect(deps.authorizationRepo.save).not.toHaveBeenCalled();
  });

  it('reactivates an existing REQUIRES_REAUTHORIZATION connection instead of creating a new one', async () => {
    const existingConnection = new BankConnection({
      id: 'conn-1',
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-old',
      accountNumber: '111',
      bankName: 'Old Bank',
      accountHolderName: 'OLD NAME',
      status: 'REQUIRES_REAUTHORIZATION',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    const deps = buildDeps({
      findByAccountNumbers: jest
        .fn()
        .mockResolvedValue(new Map([['111', existingConnection]])),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(result.connected).toEqual([
      { connectionId: 'conn-1', accountNumber: '111' },
    ]);
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-1', status: 'ACTIVE' }),
      expect.anything(),
    );
    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'RECONNECTED' }),
      expect.anything(),
    );
  });

  it('stops at the plan limit and reports the remaining accounts as skipped', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
          { accountNumber: '222', bankName: 'Bank B', accountHolderName: 'B' },
        ],
      }),
      enforceBankConnectionLimit: jest
        .fn()
        .mockRejectedValue(
          new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, 'Đã đạt giới hạn gói.'),
        ),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111', '222'],
    });

    expect(result.connected).toEqual([]);
    expect(result.skipped).toEqual([
      { accountNumber: '111', reason: 'PLAN_LIMIT_EXCEEDED' },
    ]);
  });

  it('propagates a CassoFlowUnauthorizedError for an invalid API Key without persisting anything', async () => {
    const deps = buildDeps({
      getAccountInfo: jest
        .fn()
        .mockRejectedValue(new Error('Casso Flow API Key rejected')),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        apiKey: 'bad-key',
        selectedAccountNumbers: ['111'],
      }),
    ).rejects.toThrow('Casso Flow API Key rejected');
    expect(deps.bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(deps.authorizationRepo.save).not.toHaveBeenCalled();
  });
});
