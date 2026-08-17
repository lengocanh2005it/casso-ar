import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { CopilotChatUseCase } from './copilot-chat.usecase';
import { CopilotToolRegistry } from './copilot-tool-registry';

function buildRegistry(): CopilotToolRegistry {
  const registry = new CopilotToolRegistry();
  registry.register({
    name: 'getReceivableSummary',
    description: 'summary',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  registry.register({
    name: 'getCollectionActivityTimeline',
    description: 'timeline',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  registry.register({
    name: 'getPaymentHistory',
    description: 'payments',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  registry.register({
    name: 'draftReminderEmail',
    description: 'draft',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: true,
  });
  registry.register({
    name: 'sendReminderEmail',
    description: 'send proposal',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: true,
  });
  return registry;
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    summaryTool: { execute: jest.fn() },
    timelineTool: { execute: jest.fn() },
    paymentHistoryTool: { execute: jest.fn() },
    draftTool: { execute: jest.fn() },
    conversationRepo: {
      findOrCreate: jest
        .fn()
        .mockResolvedValue({ id: 'conversation-1', userId: 'user-1' }),
      listMessages: jest.fn().mockResolvedValue([]),
      appendMessage: jest.fn().mockImplementation((message) =>
        Promise.resolve({
          id: 'message-1',
          organizationId: 'org-1',
          ...message,
        }),
      ),
    },
    pendingActionRepo: { create: jest.fn() },
    usageLogRepo: { log: jest.fn() },
    planLimitService: { enforceCopilotChatLimit: jest.fn() },
    dataSource: {
      transaction: jest.fn().mockImplementation((callback) => callback({})),
    },
    tenantContext: {
      getCurrentUser: jest.fn().mockReturnValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.FINANCE_MANAGER,
      }),
    },
    ...overrides,
  };
}

describe('CopilotChatUseCase', () => {
  it('rejects a conversation owned by another user before reading or appending', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    const deps = buildDeps({
      conversationRepo: {
        findOrCreate: jest.fn().mockResolvedValue({
          id: 'conversation-1',
          userId: 'user-2',
        }),
        listMessages: jest.fn(),
        appendMessage: jest.fn(),
      },
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({ conversationId: 'conversation-1', userMessage: 'hi' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
    expect(deps.conversationRepo.listMessages).not.toHaveBeenCalled();
    expect(deps.conversationRepo.appendMessage).not.toHaveBeenCalled();
    expect(aiProvider.createChatCompletion).not.toHaveBeenCalled();
  });

  it('loops through multiple tool rounds before returning a final answer', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'getReceivableSummary',
            arguments: { customerId: 'cust-1' },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-2',
            name: 'getCollectionActivityTimeline',
            arguments: { customerId: 'cust-1', limit: 10 },
          },
        ],
        inputTokens: 20,
        outputTokens: 8,
      })
      .mockResolvedValueOnce({
        content: 'Customer cust-1 has 2 overdue invoices.',
        toolCalls: [],
        inputTokens: 30,
        outputTokens: 15,
      });
    const deps = buildDeps();
    deps.summaryTool.execute.mockResolvedValue({ overdueCount: 2 });
    deps.timelineTool.execute.mockResolvedValue({ items: [1, 2, 3] });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'How is customer cust-1 doing?',
    });

    expect(result.pendingAction).toBeNull();
    expect(result.message.content).toContain('overdue');
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(3);
    expect(deps.summaryTool.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
    });
    expect(deps.timelineTool.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
      limit: 10,
    });
    expect(deps.pendingActionRepo.create).not.toHaveBeenCalled();
    expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(3);
    expect(deps.planLimitService.enforceCopilotChatLimit).toHaveBeenCalledTimes(
      1,
    );
  });

  it('intercepts sendReminderEmail into a pending action without another model call', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValueOnce({
      content: 'Proposing to send.',
      toolCalls: [
        {
          id: 'tool-3',
          name: 'sendReminderEmail',
          arguments: { draftId: 'draft-1', receivableId: 'receivable-1' },
        },
      ],
      inputTokens: 40,
      outputTokens: 12,
    });
    const deps = buildDeps();
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
      createdAt: new Date('2026-08-09T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Send the reminder for draft-1',
    });

    expect(result.pendingAction).toMatchObject({
      id: 'action-1',
      status: 'PENDING',
    });
    expect(deps.pendingActionRepo.create).toHaveBeenCalledWith(
      'conversation-1',
      { draftId: 'draft-1', receivableId: 'receivable-1' },
      expect.anything(),
    );
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(1);
    expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(1);
  });

  it('still executes other batched tool calls when the model also calls sendReminderEmail in the same response', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValueOnce({
      content: 'Here is the summary, and proposing to send.',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'getReceivableSummary',
          arguments: { customerId: 'cust-1' },
        },
        {
          id: 'tool-3',
          name: 'sendReminderEmail',
          arguments: { draftId: 'draft-1', receivableId: 'receivable-1' },
        },
      ],
      inputTokens: 40,
      outputTokens: 12,
    });
    const deps = buildDeps();
    deps.summaryTool.execute.mockResolvedValue({ overdueCount: 2 });
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
      createdAt: new Date('2026-08-09T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'How is cust-1 doing, and send the reminder for draft-1',
    });

    expect(result.pendingAction).toMatchObject({ id: 'action-1' });
    expect(deps.summaryTool.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
    });
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('wraps the pending-action creation and the assistant message append in one transaction', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValueOnce({
      content: 'Proposing to send.',
      toolCalls: [
        {
          id: 'tool-3',
          name: 'sendReminderEmail',
          arguments: { draftId: 'draft-1', receivableId: 'receivable-1' },
        },
      ],
      inputTokens: 40,
      outputTokens: 12,
    });
    const managers: object[] = [];
    const deps = buildDeps({
      dataSource: {
        transaction: jest.fn().mockImplementation((callback) => {
          const manager = {};
          managers.push(manager);
          return callback(manager);
        }),
      },
    });
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
      createdAt: new Date('2026-08-09T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Send the reminder for draft-1',
    });

    expect(deps.dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(deps.pendingActionRepo.create.mock.calls[0][2]).toBe(managers[1]);
    expect(deps.conversationRepo.appendMessage.mock.calls[1][1]).toBe(
      managers[1],
    );
  });

  it('enforces the billing quota before calling the AI provider', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    const deps = buildDeps();
    deps.planLimitService.enforceCopilotChatLimit.mockRejectedValue(
      Object.assign(new Error('over limit'), {
        errorCode: 'PLAN_LIMIT_EXCEEDED',
      }),
    );
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({ conversationId: 'conversation-1', userMessage: 'hi' }),
    ).rejects.toMatchObject({ errorCode: 'PLAN_LIMIT_EXCEEDED' });
    expect(aiProvider.createChatCompletion).not.toHaveBeenCalled();
  });

  it('retries once after a model timeout, with a backoff delay, and logs both attempts', async () => {
    jest.useFakeTimers();
    try {
      const aiProvider = { createChatCompletion: jest.fn() };
      aiProvider.createChatCompletion
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockResolvedValueOnce({
          content: 'Recovered after timeout.',
          toolCalls: [],
          inputTokens: 3,
          outputTokens: 4,
        });
      const deps = buildDeps();
      const useCase = new CopilotChatUseCase(
        aiProvider as any,
        buildRegistry(),
        deps.summaryTool as any,
        deps.timelineTool as any,
        deps.paymentHistoryTool as any,
        deps.draftTool as any,
        deps.conversationRepo as any,
        deps.pendingActionRepo as any,
        deps.usageLogRepo as any,
        deps.planLimitService as any,
        deps.dataSource as any,
        deps.tenantContext as any,
      );

      const resultPromise = useCase.execute({
        conversationId: 'conversation-1',
        userMessage: 'hi',
      });

      // MODEL_CALL_TIMEOUT_MS
      await jest.advanceTimersByTimeAsync(15_000);
      // The retry must wait for the backoff delay before firing again.
      expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(1);

      // retry backoff delay
      await jest.advanceTimersByTimeAsync(500);

      const result = await resultPromise;
      expect(result.message.content).toBe('Recovered after timeout.');
      expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(2);
      expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(2);
      expect(deps.usageLogRepo.log.mock.calls[0][0]).toMatchObject({
        isError: true,
      });
      expect(deps.usageLogRepo.log.mock.calls[1][0]).toMatchObject({
        isError: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retry a non-timeout provider error and logs a single attempt', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockRejectedValueOnce(
      new Error('invalid request'),
    );
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({ conversationId: 'conversation-1', userMessage: 'hi' }),
    ).rejects.toThrow('invalid request');
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(1);
    expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(1);
  });

  it('feeds a tool error back to the model as a tool message instead of aborting the turn', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValue({
      content: null,
      toolCalls: [
        {
          id: 'tool-x',
          name: 'writeOffReceivable',
          arguments: { receivableId: 'rec-1' },
        },
      ],
      inputTokens: 5,
      outputTokens: 2,
    });
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    // The model repeats the same invalid tool call every iteration, so the
    // turn exhausts MAX_TOOL_ITERATIONS instead of aborting on the first
    // failure — proving the error was fed back rather than thrown.
    await expect(
      useCase.execute({ conversationId: 'conversation-1', userMessage: 'hi' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.INTERNAL_SERVER_ERROR });

    const secondCallMessages = aiProvider.createChatCompletion.mock.calls[1][0];
    const toolMessage = secondCallMessages.find(
      (message: { role: string }) => message.role === 'tool',
    );
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      error: expect.stringContaining('Tool Copilot không xác định'),
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('recovers after a failed tool call once the model retries with a valid one', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          { id: 'tool-1', name: 'getReceivableSummary', arguments: {} },
        ],
        inputTokens: 5,
        outputTokens: 2,
      })
      .mockResolvedValueOnce({
        content: 'Customer cust-1 has 2 overdue invoices.',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 5,
      });
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'How is customer cust-1 doing?',
    });

    expect(result.message.content).toContain('overdue');
    expect(deps.summaryTool.execute).not.toHaveBeenCalled();
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('does not let a failing batched tool call abort the sendReminderEmail-interception branch', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValueOnce({
      content: 'Here is the summary, and proposing to send.',
      toolCalls: [
        { id: 'tool-1', name: 'getReceivableSummary', arguments: {} },
        {
          id: 'tool-3',
          name: 'sendReminderEmail',
          arguments: { draftId: 'draft-1', receivableId: 'receivable-1' },
        },
      ],
      inputTokens: 40,
      outputTokens: 12,
    });
    const deps = buildDeps();
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
      createdAt: new Date('2026-08-09T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'How is cust-1 doing, and send the reminder for draft-1',
    });

    expect(result.pendingAction).toMatchObject({ id: 'action-1' });
  });
});
