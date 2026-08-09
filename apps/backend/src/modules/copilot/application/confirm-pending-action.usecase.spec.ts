import { ErrorCode } from '../../../common/errors/error-code';
import { ConfirmPendingActionUseCase } from './confirm-pending-action.usecase';
import type { CopilotPendingAction } from './pending-action-repository.port';

function pendingAction(
  overrides: Partial<CopilotPendingAction> = {},
): CopilotPendingAction {
  return {
    id: 'action-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
    status: 'CONFIRMED',
    createdAt: new Date(),
    resolvedAt: new Date(),
    resolvedByUserId: 'user-1',
    ...overrides,
  };
}

function buildDraft() {
  return {
    id: 'draft-1',
    organizationId: 'org-1',
    receivableId: 'receivable-1',
    recipientEmail: 'ap@example.com',
    subject: 'Nhắc thanh toán - ABC Company',
    bodyHtml: '<p>Kính gửi ABC Company...</p>',
    createdAt: new Date(),
  };
}

describe('ConfirmPendingActionUseCase', () => {
  it('claims atomically, creates template and execution, then sends exactly once', async () => {
    const pendingActionRepo = {
      confirmIfPending: jest.fn().mockResolvedValue(pendingAction()),
    };
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const emailTemplateRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const reminderExecutionRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    const emailService = {
      sendReminderEmail: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any,
      draftRepo as any,
      emailTemplateRepo as any,
      reminderExecutionRepo as any,
      emailService as any,
    );

    const result = await useCase.execute('action-1', 'user-1');

    expect(result.reminderExecutionId).toBeDefined();
    expect(pendingActionRepo.confirmIfPending).toHaveBeenCalledWith(
      'action-1',
      'user-1',
    );
    const savedTemplate = emailTemplateRepo.save.mock.calls[0][0];
    expect(savedTemplate).toMatchObject({
      subject: 'Nhắc thanh toán - ABC Company',
      isDefault: false,
      version: 1,
    });
    const savedExecution = reminderExecutionRepo.save.mock.calls[0][0];
    expect(savedExecution).toMatchObject({
      receivableId: 'receivable-1',
      reminderRuleId: null,
      status: 'PENDING',
    });
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'receivable-1',
      templateId: savedTemplate.id,
      reminderExecutionId: savedExecution.id,
    });
  });

  it('rejects when the atomic claim fails and never sends', async () => {
    const emailService = { sendReminderEmail: jest.fn() };
    const useCase = new ConfirmPendingActionUseCase(
      { confirmIfPending: jest.fn().mockResolvedValue(null) } as any,
      { findById: jest.fn() } as any,
      { save: jest.fn() } as any,
      { save: jest.fn() } as any,
      emailService as any,
    );

    await expect(useCase.execute('action-1', 'user-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });

  it('expires an old atomically claimed action before any side effect', async () => {
    const pendingActionRepo = {
      confirmIfPending: jest
        .fn()
        .mockResolvedValue(
          pendingAction({ createdAt: new Date(Date.now() - 11 * 60 * 1000) }),
        ),
      markExpired: jest.fn().mockResolvedValue(undefined),
    };
    const emailService = { sendReminderEmail: jest.fn() };
    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any,
      { findById: jest.fn() } as any,
      { save: jest.fn() } as any,
      { save: jest.fn() } as any,
      emailService as any,
    );

    await expect(useCase.execute('action-1', 'user-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(pendingActionRepo.markExpired).toHaveBeenCalledWith('action-1');
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });
});
