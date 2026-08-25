import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { ErrorCode } from '../../../common/errors/error-code';
import { WebhookInbox } from '../domain/webhook-inbox';
import { ReprocessWebhookUseCase } from './reprocess-webhook.usecase';

function buildInbox(
  overrides: Partial<ConstructorParameters<typeof WebhookInbox>[0]> = {},
): WebhookInbox {
  return new WebhookInbox({
    id: 'inbox-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    providerTransactionId: 'txn-1',
    rawPayload: { amount: 1000 },
    receivedAt: new Date('2026-08-12'),
    status: 'FAILED',
    processedAt: null,
    errorMessage: 'match failed',
    retryCount: 5,
    ...overrides,
  });
}

function buildDeps() {
  const repo = {
    insert: jest.fn(),
    save: jest.fn(),
    findById: jest.fn().mockResolvedValue(buildInbox()),
    findPage: jest.fn(),
  };
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const tenantContext = {
    getOrganizationId: jest.fn().mockReturnValue('org-1'),
    getCurrentUser: jest.fn().mockReturnValue({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'ACCOUNTANT',
    }),
  };
  const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };
  const logger = { error: jest.fn() };
  return { repo, enqueue, tenantContext, auditLogRepo, logger };
}

describe('ReprocessWebhookUseCase', () => {
  it('re-enqueues a FAILED webhook with a deterministic job id', async () => {
    const { repo, enqueue, tenantContext, auditLogRepo, logger } = buildDeps();
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
      auditLogRepo as never,
      logger as never,
    );

    const result = await useCase.execute('inbox-1');

    expect(result.id).toBe('inbox-1');
    expect(repo.findById).toHaveBeenCalledWith('inbox-1', 'org-1');
    expect(enqueue).toHaveBeenCalledWith({
      webhookInboxId: 'inbox-1',
      organizationId: 'org-1',
      jobId: 'webhook-reprocess-inbox-1',
    });
  });

  it('writes an audit log without the raw webhook payload', async () => {
    const { repo, enqueue, tenantContext, auditLogRepo, logger } = buildDeps();
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
      auditLogRepo as never,
      logger as never,
    );

    await useCase.execute('inbox-1');

    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    const log = auditLogRepo.create.mock.calls[0][0];
    expect(log).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      actionType: AuditActionType.WEBHOOK_REPROCESS,
      entityType: AuditEntityType.WEBHOOK_INBOX,
      entityId: 'inbox-1',
    });
    expect(log.beforeState).not.toHaveProperty('rawPayload');
    expect(log.afterState).not.toHaveProperty('rawPayload');
  });

  it('keeps reprocessing successful when audit persistence fails', async () => {
    const { repo, enqueue, tenantContext, logger } = buildDeps();
    const auditLogRepo = {
      create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
      auditLogRepo as never,
      logger as never,
    );

    await expect(useCase.execute('inbox-1')).resolves.toMatchObject({
      id: 'inbox-1',
    });
  });

  it('rejects reprocessing a webhook that is not FAILED', async () => {
    const { repo, enqueue, tenantContext, auditLogRepo, logger } = buildDeps();
    repo.findById.mockResolvedValue(buildInbox({ status: 'PROCESSED' }));
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
      auditLogRepo as never,
      logger as never,
    );

    await expect(useCase.execute('inbox-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });

  it('rejects reprocessing when there is no authenticated user', async () => {
    const { repo, enqueue, auditLogRepo, logger } = buildDeps();
    const tenantContext = {
      getOrganizationId: jest.fn(),
      getCurrentUser: jest.fn().mockReturnValue(undefined),
    };
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
      auditLogRepo as never,
      logger as never,
    );

    await expect(useCase.execute('inbox-1')).rejects.toMatchObject({
      errorCode: ErrorCode.UNAUTHORIZED,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });

  it('rejects reprocessing a webhook that does not exist in the org', async () => {
    const { repo, enqueue, tenantContext, auditLogRepo, logger } = buildDeps();
    repo.findById.mockResolvedValue(null);
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
      auditLogRepo as never,
      logger as never,
    );

    await expect(useCase.execute('inbox-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });
});
