import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { CopilotController } from './copilot.controller';
import { CopilotRateLimitGuard } from './copilot-rate-limit.guard';

function buildController() {
  const copilotChatUseCase = {
    execute: jest.fn(),
    persistUserMessage: jest.fn(),
    executeStreaming: jest.fn(),
  };
  const confirmPendingActionUseCase = { execute: jest.fn() };
  const cancelPendingActionUseCase = { execute: jest.fn() };
  const getCopilotUsageUseCase = { execute: jest.fn() };
  const listCopilotDraftsUseCase = { execute: jest.fn() };
  const reopenCopilotDraftUseCase = { execute: jest.fn() };
  const updateCopilotDraftUseCase = { execute: jest.fn() };
  const deleteCopilotDraftUseCase = { execute: jest.fn() };
  const listCopilotConversationsUseCase = { execute: jest.fn() };
  const getCopilotConversationMessagesUseCase = { execute: jest.fn() };
  const idempotency = {
    execute: jest.fn((_endpoint, _key, _input, operation) => operation()),
  };
  return {
    controller: new CopilotController(
      copilotChatUseCase as any,
      confirmPendingActionUseCase as any,
      cancelPendingActionUseCase as any,
      getCopilotUsageUseCase as any,
      listCopilotDraftsUseCase as any,
      reopenCopilotDraftUseCase as any,
      updateCopilotDraftUseCase as any,
      deleteCopilotDraftUseCase as any,
      listCopilotConversationsUseCase as any,
      getCopilotConversationMessagesUseCase as any,
      idempotency as any,
    ),
    copilotChatUseCase,
    confirmPendingActionUseCase,
    cancelPendingActionUseCase,
    getCopilotUsageUseCase,
    listCopilotDraftsUseCase,
    reopenCopilotDraftUseCase,
    updateCopilotDraftUseCase,
    deleteCopilotDraftUseCase,
    listCopilotConversationsUseCase,
    getCopilotConversationMessagesUseCase,
    idempotency,
  };
}

describe('CopilotController', () => {
  it('rate-limits chat messages with the copilot guard', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        CopilotController.prototype.postMessage,
      ),
    ).toContain(CopilotRateLimitGuard);
  });

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
        isPartial: false,
        drafts: [],
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

  it('lists drafts through the query DTO', async () => {
    const deps = buildController();
    deps.listCopilotDraftsUseCase.execute.mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          organizationId: 'org-1',
          userId: 'user-1',
          receivableId: 'receivable-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>...</p>',
          createdAt: new Date('2026-08-14T10:00:00Z'),
          status: 'DRAFTED',
          pendingActionId: null,
        },
      ],
      total: 1,
    });

    await expect(
      deps.controller.listDrafts({ page: 1, limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          id: 'draft-1',
          receivableId: 'receivable-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>...</p>',
          createdAt: '2026-08-14T10:00:00.000Z',
          status: 'DRAFTED',
          pendingActionId: null,
        },
      ],
      total: 1,
    });
    expect(deps.listCopilotDraftsUseCase.execute).toHaveBeenCalledWith(
      1,
      20,
      undefined,
    );
  });

  it('wraps reopen and returns the new conversation and pending action', async () => {
    const deps = buildController();
    deps.reopenCopilotDraftUseCase.execute.mockResolvedValue({
      conversationId: 'new-conv-1',
      pendingAction: {
        id: 'new-action-1',
        organizationId: 'org-1',
        conversationId: 'new-conv-1',
        actionType: 'SEND_REMINDER_EMAIL',
        status: 'PENDING',
        payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
        createdAt: new Date('2026-08-14T10:00:00Z'),
        resolvedAt: null,
        resolvedByUserId: null,
      },
    });

    await expect(
      deps.controller.reopenDraft('draft-1', 'reopen-key'),
    ).resolves.toEqual({
      conversationId: 'new-conv-1',
      pendingAction: {
        id: 'new-action-1',
        actionType: 'SEND_REMINDER_EMAIL',
        status: 'PENDING',
        payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
        createdAt: '2026-08-14T10:00:00.000Z',
        resolvedAt: null,
      },
    });
    expect(deps.reopenCopilotDraftUseCase.execute).toHaveBeenCalledWith(
      'draft-1',
    );
  });

  it('wraps update and returns the updated draft', async () => {
    const deps = buildController();
    deps.updateCopilotDraftUseCase.execute.mockResolvedValue({
      id: 'draft-1',
      organizationId: 'org-1',
      userId: 'user-1',
      receivableId: 'receivable-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
      createdAt: new Date('2026-08-14T10:00:00Z'),
      status: 'DRAFTED',
      pendingActionId: null,
    });

    await expect(
      deps.controller.updateDraft(
        'draft-1',
        { subject: 'Tiêu đề mới', bodyHtml: '<p>mới</p>' },
        'update-key',
      ),
    ).resolves.toEqual({
      id: 'draft-1',
      receivableId: 'receivable-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
      status: 'DRAFTED',
      pendingActionId: null,
      createdAt: '2026-08-14T10:00:00.000Z',
    });
    expect(deps.updateCopilotDraftUseCase.execute).toHaveBeenCalledWith({
      id: 'draft-1',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
    });
  });

  it('wraps delete and returns success', async () => {
    const deps = buildController();
    deps.deleteCopilotDraftUseCase.execute.mockResolvedValue(undefined);

    await expect(
      deps.controller.deleteDraft('draft-1', 'delete-key'),
    ).resolves.toEqual({ success: true });
    expect(deps.deleteCopilotDraftUseCase.execute).toHaveBeenCalledWith(
      'draft-1',
    );
  });

  describe('listConversations', () => {
    it('returns the mapped conversations page', async () => {
      const { controller, listCopilotConversationsUseCase } = buildController();
      listCopilotConversationsUseCase.execute.mockResolvedValue({
        items: [
          {
            id: 'c1',
            title: 'Hỏi về công nợ',
            createdAt: new Date('2026-08-09T00:00:00Z'),
            lastMessageAt: new Date('2026-08-09T01:00:00Z'),
          },
        ],
        total: 1,
      });

      const result = await controller.listConversations({ page: 1, limit: 20 });

      expect(result).toEqual({
        items: [
          {
            id: 'c1',
            title: 'Hỏi về công nợ',
            createdAt: '2026-08-09T00:00:00.000Z',
            lastMessageAt: '2026-08-09T01:00:00.000Z',
          },
        ],
        total: 1,
      });
    });

    it('falls back to a generated title for untitled conversations', async () => {
      const { controller, listCopilotConversationsUseCase } = buildController();
      listCopilotConversationsUseCase.execute.mockResolvedValue({
        items: [
          {
            id: 'c1',
            title: null,
            createdAt: new Date('2026-08-09T00:00:00Z'),
            lastMessageAt: new Date('2026-08-09T00:00:00Z'),
          },
        ],
        total: 1,
      });

      const result = await controller.listConversations({ page: 1, limit: 20 });

      expect(result.items[0].title).not.toBe('');
      expect(result.items[0].title).toMatch(/Cuộc trò chuyện/);
    });
  });

  describe('getConversationMessages', () => {
    it('returns mapped messages for the conversation', async () => {
      const { controller, getCopilotConversationMessagesUseCase } =
        buildController();
      getCopilotConversationMessagesUseCase.execute.mockResolvedValue([
        {
          id: 'm1',
          organizationId: 'org-1',
          conversationId: 'c1',
          role: 'USER',
          content: 'Xin chào',
          toolCalls: null,
          createdAt: new Date('2026-08-09T00:00:00Z'),
        },
      ]);

      const result = await controller.getConversationMessages('c1');

      expect(result).toEqual({
        items: [
          {
            id: 'm1',
            role: 'USER',
            content: 'Xin chào',
            createdAt: '2026-08-09T00:00:00.000Z',
            isPartial: false,
            drafts: [],
          },
        ],
      });
    });
  });

  describe('streamMessage', () => {
    function buildRes() {
      const writes: string[] = [];
      return {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => writes.push(chunk)),
        end: jest.fn(),
        writes,
      };
    }

    it('persists the user message once (via idempotency) then streams status/delta/done events', async () => {
      const { controller, copilotChatUseCase, idempotency } = buildController();
      copilotChatUseCase.persistUserMessage.mockResolvedValue(undefined);
      idempotency.execute.mockImplementation(
        (
          _endpoint: string,
          _key: string,
          _input: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      );
      copilotChatUseCase.executeStreaming.mockReturnValue(
        (async function* () {
          yield { type: 'status', text: 'Đang xử lý…' };
          yield { type: 'delta', text: 'Xin chào' };
          yield {
            type: 'done',
            message: {
              id: 'm1',
              organizationId: 'org-1',
              conversationId: 'c1',
              role: 'ASSISTANT',
              content: 'Xin chào',
              toolCalls: null,
              createdAt: new Date('2026-08-09T00:00:00Z'),
            },
            pendingAction: null,
          };
        })(),
      );
      const res = buildRes();
      const req = {
        on: jest.fn(),
        user: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: Role.FINANCE_MANAGER,
        },
      };

      await controller.streamMessage(
        'c1',
        { content: 'Xin chào' },
        'key-1',
        req as any,
        res as any,
      );

      expect(copilotChatUseCase.persistUserMessage).toHaveBeenCalledWith(
        { conversationId: 'c1', userMessage: 'Xin chào' },
        { userId: 'user-1', organizationId: 'org-1' },
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(res.writes.join('')).toContain('event: status');
      expect(res.writes.join('')).toContain('event: delta');
      expect(res.writes.join('')).toContain('event: done');
      expect(res.writes.join('')).toContain('"content":"Xin chào"');
      expect(res.writes.join('')).not.toContain('organizationId');
      expect(res.end).toHaveBeenCalled();
    });

    it('stops writing once the client disconnects', async () => {
      const { controller, copilotChatUseCase, idempotency } = buildController();
      idempotency.execute.mockImplementation(
        (
          _endpoint: string,
          _key: string,
          _input: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      );
      copilotChatUseCase.persistUserMessage.mockResolvedValue(undefined);
      let closeHandler: () => void = () => {};
      const req = {
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'close') closeHandler = handler;
        }),
        user: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: Role.FINANCE_MANAGER,
        },
      };
      copilotChatUseCase.executeStreaming.mockImplementation(
        // biome-ignore lint/correctness/useYield: test double simulating an abort mid-stream
        async function* () {
          closeHandler();
        },
      );
      const res = buildRes();

      await controller.streamMessage(
        'c1',
        { content: 'Xin chào' },
        'key-1',
        req as any,
        res as any,
      );

      expect(copilotChatUseCase.executeStreaming).toHaveBeenCalledWith(
        { conversationId: 'c1', userMessage: 'Xin chào' },
        expect.any(Function),
      );
      const isAborted = copilotChatUseCase.executeStreaming.mock.calls[0][1];
      expect(isAborted()).toBe(true);
    });

    it('does not re-run the model or duplicate the assistant message on an idempotent retry with the same key', async () => {
      const { controller, copilotChatUseCase, idempotency } = buildController();
      const store = new Map<string, unknown>();
      idempotency.execute.mockImplementation(
        async (
          endpoint: string,
          key: string,
          _input: unknown,
          operation: () => Promise<unknown>,
        ) => {
          const cacheKey = `${endpoint}:${key}`;
          if (store.has(cacheKey)) return store.get(cacheKey);
          const result = await operation();
          store.set(cacheKey, result);
          return result;
        },
      );
      copilotChatUseCase.persistUserMessage.mockResolvedValue(undefined);
      copilotChatUseCase.executeStreaming.mockReturnValue(
        (async function* () {
          yield {
            type: 'done',
            message: {
              id: 'm1',
              organizationId: 'org-1',
              conversationId: 'c1',
              role: 'ASSISTANT',
              content: 'Xin chào',
              toolCalls: null,
              createdAt: new Date('2026-08-09T00:00:00Z'),
              isPartial: false,
            },
            pendingAction: null,
          };
        })(),
      );
      const req = {
        on: jest.fn(),
        user: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: Role.FINANCE_MANAGER,
        },
      };

      await controller.streamMessage(
        'c1',
        { content: 'Xin chào' },
        'retry-key',
        req as any,
        buildRes() as any,
      );
      const res2 = buildRes();
      await controller.streamMessage(
        'c1',
        { content: 'Xin chào' },
        'retry-key',
        req as any,
        res2 as any,
      );

      expect(copilotChatUseCase.persistUserMessage).toHaveBeenCalledTimes(1);
      expect(copilotChatUseCase.executeStreaming).toHaveBeenCalledTimes(1);
      expect(res2.writes.join('')).toContain('event: done');
      expect(res2.writes.join('')).toContain('"content":"Xin chào"');
    });

    it('turns a mid-stream error event into an SSE error event instead of throwing out of the handler', async () => {
      const { controller, copilotChatUseCase, idempotency } = buildController();
      idempotency.execute.mockImplementation(
        (
          _endpoint: string,
          _key: string,
          _input: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      );
      copilotChatUseCase.persistUserMessage.mockResolvedValue(undefined);
      copilotChatUseCase.executeStreaming.mockReturnValue(
        (async function* () {
          yield { type: 'status', text: 'Đang xử lý…' };
          yield {
            type: 'error',
            errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
            message: 'Copilot gặp lỗi không xác định.',
          };
        })(),
      );
      const res = buildRes();
      const req = {
        on: jest.fn(),
        user: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: Role.FINANCE_MANAGER,
        },
      };

      await expect(
        controller.streamMessage(
          'c1',
          { content: 'Xin chào' },
          'key-err',
          req as any,
          res as any,
        ),
      ).resolves.toBeUndefined();

      expect(res.writes.join('')).toContain('event: error');
      expect(res.writes.join('')).toContain('INTERNAL_SERVER_ERROR');
      expect(res.end).toHaveBeenCalled();
    });
  });
});
