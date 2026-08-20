import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { PreviewCassoFlowAuthorizationRotationUseCase } from './preview-casso-flow-authorization-rotation.usecase';

function buildAuthorization(businessId: string | null): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId,
    encryptedApiKey: 'old',
    encryptedSecureToken: 'old',
    createdAt: new Date(),
  });
}

function buildConnection(accountNumber: string): BankConnection {
  return new BankConnection({
    id: `conn-${accountNumber}`,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber,
    bankName: 'Old Bank',
    accountHolderName: 'OLD NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('PreviewCassoFlowAuthorizationRotationUseCase', () => {
  it('classifies accounts and flags currently-connected accounts missing from the new key', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
        ],
      }),
    };
    const bankConnectionRepo = {
      findByAccountNumbers: jest
        .fn()
        .mockResolvedValue(new Map([['111', buildConnection('111')]])),
      findByAuthorizationId: jest
        .fn()
        .mockResolvedValue([buildConnection('111'), buildConnection('222')]),
    };
    const authorizationRepo = {
      findById: jest.fn().mockResolvedValue(buildAuthorization('biz-1')),
    };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      adapter as never,
      bankConnectionRepo as never,
      authorizationRepo as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(result.businessId).toBe('biz-1');
    expect(result.accounts).toEqual([
      {
        accountNumber: '111',
        bankName: 'Bank A',
        accountHolderName: 'A',
        status: 'ALREADY_CONNECTED',
      },
    ]);
    expect(result.missingAccountNumbers).toEqual(['222']);
  });

  it('rejects when the new key belongs to a different business than the target authorization', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-DIFFERENT',
        accounts: [],
      }),
    };
    const authorizationRepo = {
      findById: jest.fn().mockResolvedValue(buildAuthorization('biz-1')),
    };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      adapter as never,
      {
        findByAccountNumbers: jest.fn(),
        findByAuthorizationId: jest.fn(),
      } as never,
      authorizationRepo as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        apiKey: 'new-key',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
    });
  });

  it('skips the businessId check when the target authorization has none yet (migration-backfilled)', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [],
      }),
    };
    const bankConnectionRepo = {
      findByAccountNumbers: jest.fn().mockResolvedValue(new Map()),
      findByAuthorizationId: jest.fn().mockResolvedValue([]),
    };
    const authorizationRepo = {
      findById: jest.fn().mockResolvedValue(buildAuthorization(null)),
    };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      adapter as never,
      bankConnectionRepo as never,
      authorizationRepo as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        apiKey: 'new-key',
      }),
    ).resolves.toMatchObject({ businessId: 'biz-1' });
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const authorizationRepo = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      { getAccountInfo: jest.fn() } as never,
      {
        findByAccountNumbers: jest.fn(),
        findByAuthorizationId: jest.fn(),
      } as never,
      authorizationRepo as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'missing',
        apiKey: 'new-key',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
