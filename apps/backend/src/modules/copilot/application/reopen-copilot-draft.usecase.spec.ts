import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import type { CopilotPendingAction } from './pending-action-repository.port';
import { ReopenCopilotDraftUseCase } from './reopen-copilot-draft.usecase';

jest.mock('node:crypto', () => ({ randomUUID: jest.fn() }));

function buildDraft(overrides: Partial<CopilotDraft> = {}): CopilotDraft {
  return {
    id: 'draft-1',
    organizationId: 'org-1',
    userId: 'user-1',
    receivableId: 'rec-1',
    recipientEmail: 'ap@abc.vn',
    subject: 'Nhắc thanh toán',
    bodyHtml: '<p>...</p>',
    createdAt: new Date('2026-08-10T00:00:00Z'),
    ...overrides,
  };
}

function buildAction(
  status: CopilotPendingAction['status'],
  createdAt: string,
): CopilotPendingAction {
  return {
    id: 'action-old',
    organizationId: 'org-1',
    conversationId: 'conv-old',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId: 'draft-1', receivableId: 'rec-1' },
    status,
    createdAt: new Date(createdAt),
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

function buildDeps(overrides: {
  draft?: CopilotDraft | null;
  latestAction?: CopilotPendingAction | null;
}) {
  const draftRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.draft === undefined ? buildDraft() : overrides.draft,
      ),
    findByIdForUpdate: jest
      .fn()
      .mockResolvedValue(
        overrides.draft === undefined ? buildDraft() : overrides.draft,
      ),
  };
  const pendingActionRepo = {
    findLatestForDraftIds: jest
      .fn()
      .mockResolvedValue(
        overrides.latestAction
          ? new Map([['draft-1', overrides.latestAction]])
          : new Map(),
      ),
    create: jest.fn().mockResolvedValue({
      id: 'new-action-1',
      organizationId: 'org-1',
      conversationId: 'new-conv-1',
      actionType: 'SEND_REMINDER_EMAIL',
      payload: { draftId: 'draft-1', receivableId: 'rec-1' },
      status: 'PENDING',
      createdAt: new Date('2026-08-14T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    }),
  };
  const conversationRepo = {
    findOrCreate: jest.fn().mockResolvedValue({
      id: 'new-conv-1',
      organizationId: 'org-1',
      userId: 'user-1',
      customerId: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
    }),
  };
  const tenantContext = {
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'ACCOUNTANT',
    }),
  } as unknown as TenantContextService;
  const dataSource = {
    transaction: jest.fn().mockImplementation((callback) => callback({})),
  };
  return {
    draftRepo,
    pendingActionRepo,
    conversationRepo,
    tenantContext,
    dataSource,
  };
}

describe('ReopenCopilotDraftUseCase', () => {
  beforeEach(() => {
    (randomUUID as jest.Mock).mockReturnValue('new-conv-1');
  });

  it('creates a fresh conversation and pending action for a CANCELLED draft', async () => {
    const deps = buildDeps({
      latestAction: buildAction('CANCELLED', '2026-08-14T08:00:00Z'),
    });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    const result = await useCase.execute('draft-1');

    expect(deps.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(deps.conversationRepo.findOrCreate).toHaveBeenCalledWith(
      'new-conv-1',
      'user-1',
      undefined,
      {},
    );
    expect(deps.pendingActionRepo.create).toHaveBeenCalledWith(
      'new-conv-1',
      { draftId: 'draft-1', receivableId: 'rec-1' },
      {},
    );
    expect(result).toEqual({
      conversationId: 'new-conv-1',
      pendingAction: expect.objectContaining({ id: 'new-action-1' }),
    });
  });

  it('allows reopening a draft that has never had a pending action', async () => {
    const deps = buildDeps({ latestAction: null });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    await expect(useCase.execute('draft-1')).resolves.toMatchObject({
      conversationId: 'new-conv-1',
    });
  });

  it('rejects reopening a still-PENDING draft with CONFLICT', async () => {
    const deps = buildDeps({
      latestAction: buildAction(
        'PENDING',
        new Date(Date.now() - 2 * 60_000).toISOString(),
      ),
    });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(deps.pendingActionRepo.create).not.toHaveBeenCalled();
    expect(deps.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects reopening an already-CONFIRMED draft with CONFLICT', async () => {
    const deps = buildDeps({
      latestAction: buildAction('CONFIRMED', '2026-08-14T08:00:00Z'),
    });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
  });

  it('allows reopening an EXPIRED (derived) draft', async () => {
    const deps = buildDeps({
      latestAction: buildAction(
        'PENDING',
        new Date(Date.now() - 60 * 60_000).toISOString(),
      ),
    });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    await expect(useCase.execute('draft-1')).resolves.toMatchObject({
      conversationId: 'new-conv-1',
    });
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const deps = buildDeps({ draft: null });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });

  it('throws NOT_FOUND when the draft belongs to another user', async () => {
    const deps = buildDeps({ draft: buildDraft({ userId: 'someone-else' }) });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
      deps.dataSource as never,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});
