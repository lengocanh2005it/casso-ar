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
    name: 'findOverdueReceivables',
    description: 'overdue',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  return registry;
}

async function* stream(chunks: unknown[]) {
  for (const chunk of chunks) yield chunk;
}

function buildUseCase(overrides: Record<string, unknown> = {}) {
  const deps = {
    aiProvider: {
      createChatCompletion: jest.fn(),
      streamChatCompletion: jest.fn(),
    },
    summaryTool: { execute: jest.fn() },
    timelineTool: { execute: jest.fn() },
    paymentHistoryTool: { execute: jest.fn() },
    findOverdueReceivablesTool: { execute: jest.fn() },
    draftTool: { execute: jest.fn() },
    conversationRepo: {
      findOrCreate: jest.fn(),
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
    dataSource: { transaction: jest.fn().mockImplementation((cb) => cb({})) },
    tenantContext: {
      getCurrentUser: jest.fn().mockReturnValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.FINANCE_MANAGER,
      }),
    },
    ...overrides,
  };
  const useCase = new CopilotChatUseCase(
    deps.aiProvider as any,
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
  return { useCase, deps };
}

describe('CopilotChatUseCase.executeStreaming', () => {
  it('streams content deltas then a done event when the model returns no tool calls', async () => {
    const { useCase, deps } = buildUseCase();
    deps.aiProvider.streamChatCompletion.mockReturnValue(
      stream([
        {
          contentDelta: 'Xin ',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
        {
          contentDelta: 'chào',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
        {
          contentDelta: null,
          toolCalls: null,
          inputTokens: 3,
          outputTokens: 2,
        },
      ]),
    );

    const events = [];
    for await (const event of useCase.executeStreaming(
      { conversationId: 'conversation-1', userMessage: 'Chào bạn' },
      () => false,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'status', text: 'Đang xử lý…' },
      { type: 'delta', text: 'Xin ' },
      { type: 'delta', text: 'chào' },
      {
        type: 'done',
        message: expect.objectContaining({ content: 'Xin chào' }),
        pendingAction: null,
      },
    ]);
    expect(deps.conversationRepo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ASSISTANT',
        content: 'Xin chào',
        toolCalls: null,
      }),
    );
    expect(deps.aiProvider.streamChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      { maxOutputTokens: 4096 },
    );
  });

  it('resolves a tool call before continuing to a second, final iteration', async () => {
    const { useCase, deps } = buildUseCase();
    deps.summaryTool.execute.mockResolvedValue({ remaining: 1000 });
    deps.aiProvider.streamChatCompletion
      .mockReturnValueOnce(
        stream([
          {
            contentDelta: null,
            toolCalls: [
              {
                id: 'call-1',
                name: 'getReceivableSummary',
                arguments: { customerId: 'c1' },
              },
            ],
            inputTokens: 4,
            outputTokens: 1,
          },
        ]),
      )
      .mockReturnValueOnce(
        stream([
          {
            contentDelta: 'Còn 1000 VND',
            toolCalls: null,
            inputTokens: null,
            outputTokens: null,
          },
          {
            contentDelta: null,
            toolCalls: null,
            inputTokens: 5,
            outputTokens: 3,
          },
        ]),
      );

    const events = [];
    for await (const event of useCase.executeStreaming(
      { conversationId: 'conversation-1', userMessage: 'Công nợ khách c1?' },
      () => false,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'status', text: 'Đang xử lý…' },
      { type: 'status', text: 'Đang xử lý…' },
      { type: 'delta', text: 'Còn 1000 VND' },
      {
        type: 'done',
        message: expect.objectContaining({ content: 'Còn 1000 VND' }),
        pendingAction: null,
      },
    ]);
    expect(deps.summaryTool.execute).toHaveBeenCalledWith({ customerId: 'c1' });
  });

  it('persists the partial content accumulated so far and yields a done event when aborted mid-stream', async () => {
    const { useCase, deps } = buildUseCase();
    let aborted = false;
    deps.aiProvider.streamChatCompletion.mockReturnValue(
      stream([
        {
          contentDelta: 'Đang',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
        {
          contentDelta: ' trả lời',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
      ]),
    );

    const events = [];
    for await (const event of useCase.executeStreaming(
      { conversationId: 'conversation-1', userMessage: 'Câu hỏi dài' },
      () => aborted,
    )) {
      events.push(event);
      if (event.type === 'delta' && event.text === 'Đang') aborted = true;
    }

    expect(events).toEqual([
      { type: 'status', text: 'Đang xử lý…' },
      { type: 'delta', text: 'Đang' },
      {
        type: 'done',
        message: expect.objectContaining({ content: 'Đang', isPartial: true }),
        pendingAction: null,
      },
    ]);
    expect(deps.conversationRepo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ASSISTANT',
        content: 'Đang',
        isPartial: true,
      }),
    );
  });

  it('does not persist anything when aborted before any content was streamed', async () => {
    const { useCase, deps } = buildUseCase();
    deps.aiProvider.streamChatCompletion.mockReturnValue(
      stream([
        {
          contentDelta: 'Xin chào',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
      ]),
    );

    const events = [];
    for await (const event of useCase.executeStreaming(
      { conversationId: 'conversation-1', userMessage: 'Câu hỏi' },
      () => true,
    )) {
      events.push(event);
    }

    expect(events).toEqual([]);
    expect(deps.conversationRepo.appendMessage).not.toHaveBeenCalled();
  });

  it('yields an error event instead of throwing when the model call fails', async () => {
    const { useCase, deps } = buildUseCase();
    deps.aiProvider.streamChatCompletion.mockImplementation(() => {
      throw new Error('provider down');
    });

    const events = [];
    for await (const event of useCase.executeStreaming(
      { conversationId: 'conversation-1', userMessage: 'Xin chào' },
      () => false,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'status', text: 'Đang xử lý…' },
      {
        type: 'error',
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        message: expect.any(String),
      },
    ]);
  });
});
