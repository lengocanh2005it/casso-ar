import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import type { CopilotPendingAction } from './pending-action-repository.port';
import { UpdateCopilotDraftUseCase } from './update-copilot-draft.usecase';

function buildDraft(overrides: Partial<CopilotDraft> = {}): CopilotDraft {
  return {
    id: 'draft-1',
    organizationId: 'org-1',
    userId: 'user-1',
    receivableId: 'rec-1',
    recipientEmail: 'ap@abc.vn',
    subject: 'Nhắc thanh toán',
    bodyHtml: '<p>cũ</p>',
    createdAt: new Date('2026-08-10T00:00:00Z'),
    ...overrides,
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
    save: jest.fn(),
  };
  const pendingActionRepo = {
    findLatestForDraftIds: jest
      .fn()
      .mockResolvedValue(
        overrides.latestAction
          ? new Map([['draft-1', overrides.latestAction]])
          : new Map(),
      ),
  };
  const tenantContext = {
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'ACCOUNTANT',
    }),
  } as unknown as TenantContextService;
  return { draftRepo, pendingActionRepo, tenantContext };
}

describe('UpdateCopilotDraftUseCase', () => {
  it('updates only the provided fields and returns the derived status', async () => {
    const deps = buildDeps({ latestAction: null });
    const useCase = new UpdateCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.tenantContext,
    );

    const result = await useCase.execute({
      id: 'draft-1',
      subject: 'Tiêu đề mới',
    });

    expect(deps.draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'draft-1',
        subject: 'Tiêu đề mới',
        bodyHtml: '<p>cũ</p>',
      }),
    );
    expect(result).toMatchObject({
      id: 'draft-1',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>cũ</p>',
      status: 'DRAFTED',
      pendingActionId: null,
    });
  });

  it('rejects editing a PENDING draft with CONFLICT', async () => {
    const deps = buildDeps({
      latestAction: {
        id: 'action-1',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        actionType: 'SEND_REMINDER_EMAIL',
        payload: { draftId: 'draft-1', receivableId: 'rec-1' },
        status: 'PENDING',
        createdAt: new Date('2026-08-14T09:58:00Z'),
        resolvedAt: null,
        resolvedByUserId: null,
      },
    });
    const useCase = new UpdateCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.tenantContext,
    );

    await expect(
      useCase.execute({ id: 'draft-1', subject: 'x' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(deps.draftRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft belongs to another user', async () => {
    const deps = buildDeps({ draft: buildDraft({ userId: 'someone-else' }) });
    const useCase = new UpdateCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.tenantContext,
    );

    await expect(
      useCase.execute({ id: 'draft-1', subject: 'x' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
