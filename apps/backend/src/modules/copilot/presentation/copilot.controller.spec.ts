import { Role } from '../../organizations/domain/membership';
import { CopilotController } from './copilot.controller';

function buildController() {
  const copilotChatUseCase = { execute: jest.fn() };
  const confirmPendingActionUseCase = { execute: jest.fn() };
  const cancelPendingActionUseCase = { execute: jest.fn() };
  const idempotency = {
    execute: jest.fn((_endpoint, _key, _input, operation) => operation()),
  };
  return {
    controller: new CopilotController(
      copilotChatUseCase as any,
      confirmPendingActionUseCase as any,
      cancelPendingActionUseCase as any,
      idempotency as any,
    ),
    copilotChatUseCase,
    confirmPendingActionUseCase,
    cancelPendingActionUseCase,
    idempotency,
  };
}

describe('CopilotController', () => {
  it('wraps messages in idempotency and strips internal fields from responses', async () => {
    const deps = buildController();
    deps.copilotChatUseCase.execute.mockResolvedValue({
      message: {
        id: 'message-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        role: 'ASSISTANT',
        content: 'Summary',
        toolCalls: null,
        createdAt: new Date('2026-08-09T10:00:00Z'),
      },
      pendingAction: null,
    });

    await expect(
      deps.controller.postMessage(
        'conversation-1',
        { content: 'Show summary' },
        'key-1',
      ),
    ).resolves.toEqual({
      message: {
        id: 'message-1',
        role: 'ASSISTANT',
        content: 'Summary',
        createdAt: '2026-08-09T10:00:00.000Z',
      },
      pendingAction: null,
    });
    expect(deps.copilotChatUseCase.execute).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      userMessage: 'Show summary',
    });
    expect(deps.idempotency.execute).toHaveBeenCalledWith(
      'POST /copilot/conversations/conversation-1/messages',
      'key-1',
      { content: 'Show summary' },
      expect.any(Function),
    );
  });

  it('wraps confirm and cancel and passes the authenticated user id', async () => {
    const deps = buildController();
    deps.confirmPendingActionUseCase.execute.mockResolvedValue({
      reminderExecutionId: 'execution-1',
    });
    deps.cancelPendingActionUseCase.execute.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'CANCELLED',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
      createdAt: new Date('2026-08-09T10:00:00Z'),
      resolvedAt: new Date('2026-08-09T10:01:00Z'),
      resolvedByUserId: 'user-1',
    });
    const req = {
      user: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.FINANCE_MANAGER,
      },
    };

    await expect(
      deps.controller.confirm('action-1', req as any, 'confirm-key'),
    ).resolves.toEqual({ reminderExecutionId: 'execution-1' });
    await expect(
      deps.controller.cancel('action-1', req as any, 'cancel-key'),
    ).resolves.toMatchObject({
      id: 'action-1',
      status: 'CANCELLED',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
    });
    expect(deps.confirmPendingActionUseCase.execute).toHaveBeenCalledWith(
      'action-1',
      'user-1',
    );
    expect(deps.cancelPendingActionUseCase.execute).toHaveBeenCalledWith(
      'action-1',
      'user-1',
    );
  });
});
