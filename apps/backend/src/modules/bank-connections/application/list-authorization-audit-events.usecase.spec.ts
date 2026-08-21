import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { ListAuthorizationAuditEventsUseCase } from './list-authorization-audit-events.usecase';

function buildAuthorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: 'enc-key',
    encryptedSecureToken: 'enc-token',
    createdAt: new Date(),
  });
}

function buildConnection(id: string): BankConnection {
  return new BankConnection({
    id,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '111',
    bankName: 'Bank',
    accountHolderName: 'NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function buildEvent(id: string): ConnectionAuditEvent {
  return new ConnectionAuditEvent({
    id,
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    eventType: 'API_KEY_ROTATED',
    metadata: {},
    createdAt: new Date(),
  });
}

function buildDeps(
  overrides: {
    authorization?: CassoFlowAuthorization | null;
    connections?: BankConnection[];
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
  const auditEventRepo = {
    findByBankConnectionIds: jest
      .fn()
      .mockResolvedValue({ items: [buildEvent('evt-1')], total: 1 }),
  };
  return { authorizationRepo, bankConnectionRepo, auditEventRepo };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new ListAuthorizationAuditEventsUseCase(
    deps.authorizationRepo as never,
    deps.bankConnectionRepo as never,
    deps.auditEventRepo as never,
  );
}

describe('ListAuthorizationAuditEventsUseCase', () => {
  it('lists audit events across every connection under the authorization', async () => {
    const deps = buildDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'evt-1' })],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(deps.auditEventRepo.findByBankConnectionIds).toHaveBeenCalledWith(
      'org-1',
      ['conn-1'],
      [
        'TOKEN_EXCHANGED',
        'RECONNECTED',
        'DISCONNECTED',
        'API_KEY_ROTATED',
        'API_KEY_REVEALED',
      ],
      1,
      20,
    );
  });

  it('returns an empty page without querying events when the authorization has no connections', async () => {
    const deps = buildDeps({ connections: [] });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(deps.auditEventRepo.findByBankConnectionIds).not.toHaveBeenCalled();
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const deps = buildDeps({ authorization: null });
    const useCase = buildUseCase(deps);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'missing',
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
