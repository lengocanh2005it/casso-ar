import { ErrorCode } from '../../../common/errors/error-code';
import { CancelPendingActionUseCase } from './cancel-pending-action.usecase';
import type { CopilotPendingAction } from './pending-action-repository.port';

function cancelledAction(
  overrides: Partial<CopilotPendingAction> = {},
): CopilotPendingAction {
  return {
    id: 'action-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
    status: 'CANCELLED',
    createdAt: new Date(),
    resolvedAt: new Date(),
    resolvedByUserId: 'user-1',
    ...overrides,
  };
}

describe('CancelPendingActionUseCase', () => {
  it('returns the action after atomically cancelling it', async () => {
    const pendingActionRepo = {
      cancelIfPending: jest.fn().mockResolvedValue(cancelledAction()),
    };
    const useCase = new CancelPendingActionUseCase(pendingActionRepo as any);

    const result = await useCase.execute('action-1', 'user-1');

    expect(result).toMatchObject({ id: 'action-1', status: 'CANCELLED' });
    expect(pendingActionRepo.cancelIfPending).toHaveBeenCalledWith(
      'action-1',
      'user-1',
    );
  });

  it('rejects when the atomic cancellation claim fails', async () => {
    const useCase = new CancelPendingActionUseCase({
      cancelIfPending: jest.fn().mockResolvedValue(null),
    } as any);

    await expect(useCase.execute('action-1', 'user-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
  });

  it('expires an old atomically claimed action', async () => {
    const pendingActionRepo = {
      cancelIfPending: jest
        .fn()
        .mockResolvedValue(
          cancelledAction({ createdAt: new Date(Date.now() - 11 * 60 * 1000) }),
        ),
      markExpired: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new CancelPendingActionUseCase(pendingActionRepo as any);

    await expect(useCase.execute('action-1', 'user-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(pendingActionRepo.markExpired).toHaveBeenCalledWith('action-1');
  });
});
