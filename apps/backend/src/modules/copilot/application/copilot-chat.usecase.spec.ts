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
    name: 'findOverdueReceivables',
    description: 'overdue',
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
    findOverdueReceivablesTool: { execute: jest.fn() },
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
    receivableRepo: { findById: jest.fn().mockResolvedValue(null) },
    customerRepo: { findById: jest.fn().mockResolvedValue(null) },
    invoiceRepo: { findById: jest.fn().mockResolvedValue(null) },
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
      deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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

  it('persists receivable presentation metadata with a pending action', async () => {
    const aiProvider = {
      createChatCompletion: jest.fn().mockResolvedValueOnce({
        content: 'Đề xuất gửi email nhắc.',
        toolCalls: [
          {
            id: 'tool-3',
            name: 'sendReminderEmail',
            arguments: { draftId: 'draft-1', receivableId: 'receivable-1' },
          },
        ],
        inputTokens: 40,
        outputTokens: 12,
      }),
    };
    const deps = buildDeps({
      receivableRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'receivable-1',
          organizationId: 'org-1',
          customerId: 'customer-1',
          invoiceId: 'invoice-1',
        }),
      },
      customerRepo: {
        findById: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          name: 'Công ty An Phát',
        }),
      },
      invoiceRepo: {
        findById: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          invoiceNumber: 'INV-2026-001',
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
      deps.findOverdueReceivablesTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.invoiceRepo as any,
    );

    await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Gửi email nhắc thanh toán',
    });

    expect(deps.pendingActionRepo.create).toHaveBeenCalledWith(
      'conversation-1',
      {
        draftId: 'draft-1',
        receivableId: 'receivable-1',
        customerName: 'Công ty An Phát',
        invoiceNumber: 'INV-2026-001',
      },
      expect.anything(),
    );
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
      deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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
        deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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
      deps.findOverdueReceivablesTool as any,
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

  it('creates the conversation with a title derived from the first user message', async () => {
    const aiProvider = {
      createChatCompletion: jest.fn().mockResolvedValue({
        content: 'Chào bạn',
        toolCalls: [],
        inputTokens: 1,
        outputTokens: 1,
      }),
    };
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'Công nợ khách ABC còn bao nhiêu?',
    });

    expect(deps.conversationRepo.findOrCreate).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
      'Công nợ khách ABC còn bao nhiêu?',
      expect.anything(),
    );
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
      deps.findOverdueReceivablesTool as any,
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

  it('attaches a draftReminderEmail result as output on the final message when no send is proposed', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            arguments: {
              receivableId: 'rec-1',
              subject: 'Nhắc thanh toán',
              bodyHtml: '<p>Nội dung</p>',
            },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Đã tạo bản nháp cho bạn.',
        toolCalls: [],
        inputTokens: 5,
        outputTokens: 5,
      });
    const deps = buildDeps();
    deps.draftTool.execute.mockResolvedValue({
      draftId: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'Draft a reminder for rec-1',
    });

    expect(result.pendingAction).toBeNull();
    expect(result.message.toolCalls).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        name: 'draftReminderEmail',
        output: expect.objectContaining({ draftId: 'draft-1' }),
      }),
    ]);
  });

  it('includes an earlier-round draftReminderEmail output alongside a later sendReminderEmail proposal', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            arguments: {
              receivableId: 'rec-1',
              subject: 'Nhắc thanh toán',
              bodyHtml: '<p>Nội dung</p>',
            },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Đề xuất gửi.',
        toolCalls: [
          {
            id: 'tool-2',
            name: 'sendReminderEmail',
            arguments: { draftId: 'draft-1', receivableId: 'rec-1' },
          },
        ],
        inputTokens: 20,
        outputTokens: 8,
      });
    const deps = buildDeps();
    deps.draftTool.execute.mockResolvedValue({
      draftId: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
    });
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'rec-1' },
      createdAt: new Date('2026-08-21T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'Draft then send for rec-1',
    });

    expect(result.pendingAction).toMatchObject({ id: 'action-1' });
    expect(result.message.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tool-1',
          name: 'draftReminderEmail',
          output: expect.objectContaining({ draftId: 'draft-1' }),
        }),
        expect.objectContaining({ id: 'tool-2', name: 'sendReminderEmail' }),
      ]),
    );
  });

  it('dispatches findOverdueReceivables with optional search and limit arguments', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-od',
            name: 'findOverdueReceivables',
            arguments: { search: 'Alpha', limit: 5 },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Tìm thấy 1 hóa đơn quá hạn cho Alpha.',
        toolCalls: [],
        inputTokens: 20,
        outputTokens: 10,
      });
    const deps = buildDeps();
    deps.findOverdueReceivablesTool.execute.mockResolvedValue({
      items: [
        {
          receivableId: 'rec-1',
          customerName: 'Alpha Corp',
          invoiceNumber: 'INV-100',
          remainingAmount: 5_000_000,
          dueDate: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'Tìm hóa đơn quá hạn của Alpha',
    });

    expect(deps.findOverdueReceivablesTool.execute).toHaveBeenCalledWith({
      search: 'Alpha',
      limit: 5,
    });
    expect(result.message.content).toContain('Alpha');
  });

  it('feeds back a validation error when findOverdueReceivables receives invalid argument types', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValue({
      content: null,
      toolCalls: [
        {
          id: 'tool-od-err',
          name: 'findOverdueReceivables',
          arguments: { search: 123, limit: 'invalid' },
        },
      ],
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
      deps.findOverdueReceivablesTool as any,
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
    ).rejects.toMatchObject({ errorCode: ErrorCode.INTERNAL_SERVER_ERROR });

    const secondCallMessages = aiProvider.createChatCompletion.mock.calls[1][0];
    const toolMessage = secondCallMessages.find(
      (message: { role: string }) => message.role === 'tool',
    );
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('includes Casso AR identity and Vietnamese-default language policy in the system message', async () => {
    const aiProvider = {
      createChatCompletion: jest.fn().mockResolvedValue({
        content: 'Xin chào!',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'hi',
    });

    const greetingMessages = aiProvider.createChatCompletion.mock
      .calls[0][0] as Array<{
      role: string;
      content: string | null;
    }>;
    const greetingSystemMessage = greetingMessages.find(
      (message) => message.role === 'system',
    );

    expect(greetingSystemMessage?.content).toContain('Casso AR Copilot');
    expect(greetingSystemMessage?.content).toContain('greeting');
    expect(greetingSystemMessage?.content).toContain('tra cứu khoản phải thu');
    expect(greetingSystemMessage?.content).toContain(
      'theo dõi công nợ quá hạn',
    );
    expect(greetingSystemMessage?.content).toContain('xem lịch sử thanh toán');
    expect(greetingSystemMessage?.content).toContain(
      'soạn email nhắc thanh toán',
    );
    expect(greetingSystemMessage?.content).toContain('Vietnamese');
    expect(greetingSystemMessage?.content).toContain(
      'only when the user explicitly asks',
    );

    await useCase.execute({
      conversationId: 'conversation-2',
      userMessage: 'Please answer in English',
    });

    const explicitEnglishMessages = aiProvider.createChatCompletion.mock
      .calls[1][0] as Array<{
      role: string;
      content: string | null;
    }>;
    const explicitEnglishSystemMessage = explicitEnglishMessages.find(
      (message) => message.role === 'system',
    );

    expect(explicitEnglishSystemMessage?.content).toContain(
      'only when the user explicitly asks for English',
    );
  });

  it('includes enterprise tone, domain vocabulary, and user-facing safety policy', async () => {
    const aiProvider = {
      createChatCompletion: jest.fn().mockResolvedValue({
        content: 'Chào bạn',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'Tổng quan công nợ',
    });

    const messages = aiProvider.createChatCompletion.mock.calls[0][0] as Array<{
      role: string;
      content: string | null;
    }>;
    const systemMessage = messages.find((message) => message.role === 'system');

    expect(systemMessage?.content).toContain(
      'professional, neutral enterprise tone',
    );
    expect(systemMessage?.content).toContain('concise');
    expect(systemMessage?.content).toContain('action-oriented');
    expect(systemMessage?.content).toContain('casual');
    expect(systemMessage?.content).toContain('promotional');
    expect(systemMessage?.content).toContain('"tôi"');
    expect(systemMessage?.content).toContain('công nợ');
    expect(systemMessage?.content).toContain('khoản phải thu');
    expect(systemMessage?.content).toContain('thanh toán');
    expect(systemMessage?.content).toContain('quá hạn');
    expect(systemMessage?.content).toContain('khách hàng');
    expect(systemMessage?.content).toContain('email nhắc thanh toán');
    expect(systemMessage?.content).toContain('Never invent');
    expect(systemMessage?.content).toContain('internal UUIDs');
    expect(systemMessage?.content).toContain('tool names');
    expect(systemMessage?.content).toContain('schema field names');
    expect(systemMessage?.content).toContain('raw provider errors');
  });

  it('requires Vietnamese clarification before drafting without receivable context', async () => {
    const aiProvider = {
      createChatCompletion: jest.fn().mockResolvedValue({
        content: 'Vui lòng cung cấp tên khách hàng hoặc số hóa đơn.',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 10,
      }),
    };
    const deps = buildDeps();
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
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
      userMessage: 'Soạn email nhắc nợ',
    });

    const messages = aiProvider.createChatCompletion.mock.calls[0][0] as Array<{
      role: string;
      content: string | null;
    }>;
    const systemMessage = messages.find((message) => message.role === 'system');

    expect(systemMessage?.content).toContain(
      'ask in Vietnamese for the customer name or invoice number',
    );
    expect(systemMessage?.content).toContain('do not guess');
    expect(systemMessage?.content).toContain('create a draft');
    expect(systemMessage?.content).toContain(
      'in Vietnamese unless the user explicitly requests English',
    );
  });
});
