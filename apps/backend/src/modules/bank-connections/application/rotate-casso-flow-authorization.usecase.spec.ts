import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { RotateCassoFlowAuthorizationUseCase } from './rotate-casso-flow-authorization.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function buildAuthorization(
  businessId: string | null = 'biz-1',
): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId,
    encryptedApiKey: encryptToken('AK_CS.oldkey1234', encryptionKey),
    encryptedSecureToken: encryptToken('old-secret', encryptionKey),
    createdAt: new Date(),
  });
}

function buildConnection(
  accountNumber: string,
  status: BankConnection['status'] = 'ACTIVE',
): BankConnection {
  return new BankConnection({
    id: `conn-${accountNumber}`,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber,
    bankName: 'Old Bank',
    accountHolderName: 'OLD NAME',
    status,
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function buildDeps(
  overrides: {
    getAccountInfo?: jest.Mock;
    authorization?: CassoFlowAuthorization | null;
    currentConnections?: BankConnection[];
  } = {},
) {
  const authorization =
    overrides.authorization === undefined
      ? buildAuthorization()
      : overrides.authorization;
  const adapter = {
    getAccountInfo:
      overrides.getAccountInfo ??
      jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          {
            accountNumber: '111',
            bankName: 'New Bank',
            accountHolderName: 'NEW NAME',
          },
        ],
      }),
    registerWebhook: jest.fn().mockResolvedValue(undefined),
  };
  const bankConnectionRepo = {
    findByAuthorizationId: jest
      .fn()
      .mockResolvedValue(
        overrides.currentConnections ?? [buildConnection('111')],
      ),
    save: jest.fn(),
  };
  const authorizationRepo = {
    findById: jest.fn().mockResolvedValue(authorization),
    findByIdForUpdate: jest.fn().mockResolvedValue(authorization),
    save: jest.fn(),
  };
  const auditEventRepo = { save: jest.fn() };
  return { adapter, bankConnectionRepo, authorizationRepo, auditEventRepo };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new RotateCassoFlowAuthorizationUseCase(
    deps.adapter as never,
    deps.bankConnectionRepo as never,
    deps.authorizationRepo as never,
    deps.auditEventRepo as never,
    dataSource as never,
    encryptionKey,
  );
}

describe('RotateCassoFlowAuthorizationUseCase', () => {
  it('rotates every ACTIVE connection matching the new key and updates the authorization', async () => {
    const deps = buildDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
      userId: 'user-1',
    });

    expect(result.rotatedAccountNumbers).toEqual(['111']);
    expect(deps.adapter.registerWebhook).toHaveBeenCalledTimes(1);
    expect(deps.authorizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1' }),
      expect.anything(),
    );
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accountNumber: '111',
        bankName: 'New Bank',
        accountHolderName: 'NEW NAME',
      }),
      expect.anything(),
    );
    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'API_KEY_ROTATED' }),
      expect.anything(),
    );
  });

  it('leaves a connection untouched when its account is missing from the new key', async () => {
    const deps = buildDeps({
      currentConnections: [buildConnection('111'), buildConnection('222')],
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
      userId: 'user-1',
    });

    expect(result.rotatedAccountNumbers).toEqual(['111']);
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not rotate a matched connection that is not ACTIVE', async () => {
    const deps = buildDeps({
      currentConnections: [buildConnection('111', 'ERROR')],
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
      userId: 'user-1',
    });

    expect(result.rotatedAccountNumbers).toEqual([]);
    expect(deps.bankConnectionRepo.save).not.toHaveBeenCalled();
  });

  it('reports accounts from the new key not yet connected under this authorization', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          {
            accountNumber: '111',
            bankName: 'New Bank',
            accountHolderName: 'NEW NAME',
          },
          { accountNumber: '999', bankName: 'Bank X', accountHolderName: 'X' },
        ],
      }),
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
      userId: 'user-1',
    });

    expect(result.newlyDiscovered).toEqual([
      { accountNumber: '999', bankName: 'Bank X', accountHolderName: 'X' },
    ]);
  });

  it('rejects when the new key belongs to a different business', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-DIFFERENT',
        accounts: [],
      }),
    });
    const useCase = buildUseCase(deps);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        apiKey: 'new-key',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
    });
    expect(deps.adapter.registerWebhook).not.toHaveBeenCalled();
  });

  it('adopts the businessId when the authorization has none yet', async () => {
    const deps = buildDeps({ authorization: buildAuthorization(null) });
    const useCase = buildUseCase(deps);

    await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
      userId: 'user-1',
    });

    expect(deps.authorizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1' }),
      expect.anything(),
    );
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const deps = buildDeps({ authorization: null });
    const useCase = buildUseCase(deps);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'missing',
        apiKey: 'new-key',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('records the actor, old/new masked key, and old/new bank details on rotate', async () => {
    const deps = buildDeps();
    const useCase = buildUseCase(deps);

    await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'AK_CS.newkey5678',
      userId: 'user-1',
    });

    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'API_KEY_ROTATED',
        metadata: expect.objectContaining({
          actorUserId: 'user-1',
          newMaskedApiKey: '••••5678',
          oldBankName: 'Old Bank',
          newBankName: 'New Bank',
          oldAccountHolderName: 'OLD NAME',
          newAccountHolderName: 'NEW NAME',
        }),
      }),
      expect.anything(),
    );
  });
});
