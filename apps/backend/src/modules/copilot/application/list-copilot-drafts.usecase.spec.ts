import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import { ListCopilotDraftsUseCase } from './list-copilot-drafts.usecase';
import type { CopilotPendingAction } from './pending-action-repository.port';

function buildDraft(id: string, createdAt: string): CopilotDraft {
  return {
    id,
    organizationId: 'org-1',
    userId: 'user-1',
    receivableId: `rec-${id}`,
    recipientEmail: 'ap@abc.vn',
    subject: `Draft ${id}`,
    bodyHtml: '<p>body</p>',
    createdAt: new Date(createdAt),
  };
}

function buildAction(
  draftId: string,
  status: CopilotPendingAction['status'],
  createdAt: string,
): CopilotPendingAction {
  return {
    id: `action-${draftId}`,
    organizationId: 'org-1',
    conversationId: 'conv-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId, receivableId: `rec-${draftId}` },
    status,
    createdAt: new Date(createdAt),
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

describe('ListCopilotDraftsUseCase', () => {
  it('derives status per draft, filters by status, and paginates in memory', async () => {
    const drafts = [
      buildDraft('d1', '2026-08-14T10:00:00Z'),
      buildDraft('d2', '2026-08-14T09:00:00Z'),
      buildDraft('d3', '2026-08-14T08:00:00Z'),
    ];
    const draftRepo = {
      findAllForUser: jest.fn().mockResolvedValue(drafts),
    };
    const actionsMap = new Map([
      ['d1', buildAction('d1', 'CANCELLED', '2026-08-14T10:01:00Z')],
      // d2 has no action -> DRAFTED
      ['d3', buildAction('d3', 'CONFIRMED', '2026-08-14T08:01:00Z')],
    ]);
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(actionsMap),
    };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new ListCopilotDraftsUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    const all = await useCase.execute(1, 20);
    expect(all.total).toBe(3);
    expect(all.items.map((item) => [item.id, item.status])).toEqual([
      ['d1', 'CANCELLED'],
      ['d2', 'DRAFTED'],
      ['d3', 'CONFIRMED'],
    ]);
    expect(all.items[0].pendingActionId).toBe('action-d1');
    expect(all.items[1].pendingActionId).toBeNull();

    const filtered = await useCase.execute(1, 20, 'DRAFTED');
    expect(filtered.total).toBe(1);
    expect(filtered.items.map((item) => item.id)).toEqual(['d2']);

    const paged = await useCase.execute(2, 2);
    expect(paged.total).toBe(3);
    expect(paged.items.map((item) => item.id)).toEqual(['d3']);
  });

  it('throws UNAUTHORIZED when there is no current user', async () => {
    const tenantContext = {
      getCurrentUser: () => undefined,
    } as unknown as TenantContextService;
    const useCase = new ListCopilotDraftsUseCase(
      { findAllForUser: jest.fn() } as never,
      { findLatestForDraftIds: jest.fn() } as never,
      tenantContext,
    );

    await expect(useCase.execute(1, 20)).rejects.toMatchObject({
      errorCode: ErrorCode.UNAUTHORIZED,
    });
  });
});
