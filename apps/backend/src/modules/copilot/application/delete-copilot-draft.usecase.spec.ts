import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { DeleteCopilotDraftUseCase } from './delete-copilot-draft.usecase';
import type { CopilotDraft } from './draft-repository.port';

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

describe('DeleteCopilotDraftUseCase', () => {
  it('deletes a DRAFTED (orphan) draft', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(buildDraft()),
      delete: jest.fn(),
    };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(new Map()),
    };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;
    const useCase = new DeleteCopilotDraftUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    await useCase.execute('draft-1');

    expect(draftRepo.delete).toHaveBeenCalledWith('draft-1');
  });

  it('rejects deleting a CONFIRMED draft with CONFLICT and does not delete', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(buildDraft()),
      delete: jest.fn(),
    };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'draft-1',
            {
              id: 'action-1',
              organizationId: 'org-1',
              conversationId: 'conv-1',
              actionType: 'SEND_REMINDER_EMAIL' as const,
              payload: { draftId: 'draft-1', receivableId: 'rec-1' },
              status: 'CONFIRMED' as const,
              createdAt: new Date('2026-08-14T08:00:00Z'),
              resolvedAt: new Date('2026-08-14T08:01:00Z'),
              resolvedByUserId: 'user-1',
            },
          ],
        ]),
      ),
    };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;
    const useCase = new DeleteCopilotDraftUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(draftRepo.delete).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const pendingActionRepo = { findLatestForDraftIds: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;
    const useCase = new DeleteCopilotDraftUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});
