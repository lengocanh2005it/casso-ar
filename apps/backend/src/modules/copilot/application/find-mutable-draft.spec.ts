import { ErrorCode } from '../../../common/errors/error-code';
import type { CopilotDraft } from './draft-repository.port';
import { findMutableDraft } from './find-mutable-draft';
import type { CopilotPendingAction } from './pending-action-repository.port';

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
    id: 'action-1',
    organizationId: 'org-1',
    conversationId: 'conv-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId: 'draft-1', receivableId: 'rec-1' },
    status,
    createdAt: new Date(createdAt),
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

describe('findMutableDraft', () => {
  it('returns the draft, its derived status, and pendingActionId when CANCELLED', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['draft-1', buildAction('CANCELLED', '2026-08-14T08:00:00Z')],
          ]),
        ),
    };

    const result = await findMutableDraft(
      'draft-1',
      'user-1',
      draftRepo as never,
      pendingActionRepo as never,
    );

    expect(result.status).toBe('CANCELLED');
    expect(result.pendingActionId).toBe('action-1');
    expect(result.draft.id).toBe('draft-1');
  });

  it('returns DRAFTED with a null pendingActionId when there is no action', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(new Map()),
    };

    const result = await findMutableDraft(
      'draft-1',
      'user-1',
      draftRepo as never,
      pendingActionRepo as never,
    );

    expect(result.status).toBe('DRAFTED');
    expect(result.pendingActionId).toBeNull();
  });

  it('throws CONFLICT when the draft is PENDING', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['draft-1', buildAction('PENDING', '2026-08-14T09:58:00Z')],
          ]),
        ),
    };

    await expect(
      findMutableDraft(
        'draft-1',
        'user-1',
        draftRepo as never,
        pendingActionRepo as never,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('throws CONFLICT when the draft is CONFIRMED', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['draft-1', buildAction('CONFIRMED', '2026-08-14T08:00:00Z')],
          ]),
        ),
    };

    await expect(
      findMutableDraft(
        'draft-1',
        'user-1',
        draftRepo as never,
        pendingActionRepo as never,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(null) };
    const pendingActionRepo = { findLatestForDraftIds: jest.fn() };

    await expect(
      findMutableDraft(
        'draft-1',
        'user-1',
        draftRepo as never,
        pendingActionRepo as never,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(pendingActionRepo.findLatestForDraftIds).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft belongs to another user', async () => {
    const draftRepo = {
      findById: jest
        .fn()
        .mockResolvedValue(buildDraft({ userId: 'someone-else' })),
    };
    const pendingActionRepo = { findLatestForDraftIds: jest.fn() };

    await expect(
      findMutableDraft(
        'draft-1',
        'user-1',
        draftRepo as never,
        pendingActionRepo as never,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
