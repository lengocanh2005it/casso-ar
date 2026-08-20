import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { hashPassword } from '../../auth/application/password-hasher';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { RevealCassoFlowApiKeyUseCase } from './reveal-casso-flow-api-key.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function buildAuthorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: encryptToken('AK_CS.real-key', encryptionKey),
    encryptedSecureToken: encryptToken('secret', encryptionKey),
    createdAt: new Date(),
  });
}

function buildConnection(id: string): BankConnection {
  return new BankConnection({
    id,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: `acc-${id}`,
    bankName: 'Casso Bank',
    accountHolderName: 'NGUYEN VAN A',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

async function buildDeps(
  overrides: {
    authorization?: CassoFlowAuthorization | null;
    connections?: BankConnection[];
    userPassword?: string;
    user?: { passwordHash: string } | null;
  } = {},
) {
  const authorizationRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.authorization === undefined
          ? buildAuthorization()
          : overrides.authorization,
      ),
  };
  const bankConnectionRepo = {
    findByAuthorizationId: jest
      .fn()
      .mockResolvedValue(overrides.connections ?? [buildConnection('conn-1')]),
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue(
      overrides.user === undefined
        ? {
            passwordHash: await hashPassword(
              overrides.userPassword ?? 'correct',
            ),
          }
        : overrides.user,
    ),
  };
  const auditEventRepo = { save: jest.fn().mockResolvedValue(undefined) };

  const useCase = new RevealCassoFlowApiKeyUseCase(
    authorizationRepo as never,
    bankConnectionRepo as never,
    userRepo as never,
    auditEventRepo as never,
    encryptionKey,
  );

  return {
    useCase,
    authorizationRepo,
    bankConnectionRepo,
    userRepo,
    auditEventRepo,
  };
}

describe('RevealCassoFlowApiKeyUseCase', () => {
  it('throws NOT_FOUND when the authorization does not exist', async () => {
    const { useCase } = await buildDeps({ authorization: null });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        userId: 'user-1',
        password: 'secret',
      }),
    ).rejects.toThrow(AppError);
  });

  it('throws UNAUTHORIZED when the password does not match', async () => {
    const { useCase } = await buildDeps({ userPassword: 'correct' });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        userId: 'user-1',
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.UNAUTHORIZED });
  });

  it('returns the decrypted key and writes one audit event per connection on success', async () => {
    const { useCase, auditEventRepo } = await buildDeps({
      connections: [buildConnection('conn-1'), buildConnection('conn-2')],
      userPassword: 'correct',
    });

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      userId: 'user-1',
      password: 'correct',
    });

    expect(result.apiKey).toBe('AK_CS.real-key');
    expect(auditEventRepo.save).toHaveBeenCalledTimes(2);
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'API_KEY_REVEALED',
        bankConnectionId: 'conn-1',
      }),
      undefined,
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'API_KEY_REVEALED',
        bankConnectionId: 'conn-2',
      }),
      undefined,
    );
  });

  it('returns the key with zero audit writes when the authorization has no connections', async () => {
    const { useCase, auditEventRepo } = await buildDeps({
      connections: [],
      userPassword: 'correct',
    });

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      userId: 'user-1',
      password: 'correct',
    });

    expect(result.apiKey).toBe('AK_CS.real-key');
    expect(auditEventRepo.save).not.toHaveBeenCalled();
  });

  it('records a masked API key alongside the actor on reveal', async () => {
    const { useCase, auditEventRepo } = await buildDeps({
      userPassword: 'correct',
    });

    await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      userId: 'user-1',
      password: 'correct',
    });

    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'API_KEY_REVEALED',
        metadata: {
          revealedByUserId: 'user-1',
          maskedApiKey: '••••-key',
        },
      }),
      undefined,
    );
  });
});
