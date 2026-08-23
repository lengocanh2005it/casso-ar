import { Permission, ROLE_PERMISSIONS } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import {
  AI_CHAT_PROVIDER,
  type AIChatCompletionResult,
  type AIChatMessage,
  type AIStreamChunk,
  type AIToolCall,
  type IAIChatProvider,
} from './ai-chat-provider.port';
import {
  AI_USAGE_LOG_REPOSITORY,
  type IAIUsageLogRepository,
} from './ai-usage-log-repository.port';
import {
  COPILOT_CONVERSATION_REPOSITORY,
  type CopilotMessageRecord,
  type ICopilotConversationRepository,
} from './conversation-repository.port';
import { CopilotToolRegistry } from './copilot-tool-registry';
import { deriveConversationTitle } from './derive-conversation-title';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';
import {
  type DraftReminderEmailResult,
  DraftReminderEmailTool,
} from './tools/draft-reminder-email.tool';
import { FindOverdueReceivablesTool } from './tools/find-overdue-receivables.tool';
import { GetCollectionActivityTimelineTool } from './tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './tools/get-payment-history.tool';
import { GetReceivableSummaryTool } from './tools/get-receivable-summary.tool';
import { SendReminderEmailTool } from './tools/send-reminder-email.tool';

const PROMPT_VERSION = 'copilot-v2';
const MODEL_CALL_TIMEOUT_MS = 15_000;
const MODEL_CALL_RETRY_BACKOFF_MS = 500;
const MAX_TOOL_ITERATIONS = 5;
const SYSTEM_PROMPT = [
  'You are Casso Ledger Copilot, the Casso Ledger assistant for accounts receivable and collections. When greeting or asked who you are, identify yourself by that exact name and concisely explain your purpose in Vietnamese: tra cứu khoản phải thu, theo dõi công nợ quá hạn, xem lịch sử thanh toán và soạn email nhắc thanh toán.',
  'Vietnamese is the default response language, including greetings and English-language input. Switch to English only when the user explicitly asks for English.',
  'Use a professional, neutral enterprise tone with concise, action-oriented responses without sounding casual or promotional. Avoid unnecessary first-person phrasing such as "tôi". Prefer the terms công nợ, khoản phải thu, thanh toán, quá hạn, khách hàng, and email nhắc thanh toán.',
  'Use only structured JSON returned by read tools and facts already present in the conversation. Never invent customer, receivable, invoice, amount, due-date, payment-history, or recipient data.',
  'If the user asks to prepare a reminder without identifying a customer or receivable, ask in Vietnamese for the customer name or invoice number; do not guess, select an arbitrary receivable, or create a draft.',
  'Never expose internal UUIDs, tool names, schema field names, raw provider errors, or implementation details in user-facing text. Summarize recoverable tool errors in Vietnamese without repeating technical error messages.',
  'If the user wants to send a reminder email, call draftReminderEmail first to create a draft, then call sendReminderEmail to propose sending it — the user must separately confirm the actual send; you do not send it yourself.',
  'Before calling draftReminderEmail, you must already have the real remaining amount and due date for the receivable from a prior findOverdueReceivables or getReceivableSummary call (or from data already in this conversation) — write the subject and bodyHtml yourself, in Vietnamese unless the user explicitly requests English, using only those real figures; never invent an amount or date.',
  'When looking up overdue receivables with findOverdueReceivables: if 0 items are returned, explain in Vietnamese that no matching overdue receivable was found and do not call draftReminderEmail; if 1 item is returned, you may proceed to draft the reminder email; if multiple items are returned, present them as a numbered list with customer name, invoice number (or "Chưa có số hóa đơn" if null), remaining amount, and due date so the user can choose. If 20 items are returned, the result is ambiguous and you must ask the user to narrow down by customer name or invoice number without guessing. Never display internal UUIDs (like receivableId or customerId) in user-facing text.',
  'You have neither permission nor tools to write off receivables, allocate payments, or handle disputes — if the user asks, direct them to the standard interface.',
].join(' ');

export interface CopilotChatInput {
  conversationId: string;
  userMessage: string;
}

export interface CopilotChatResult {
  message: CopilotMessageRecord;
  pendingAction: CopilotPendingAction | null;
}

export type CopilotStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      message: CopilotMessageRecord;
      pendingAction: CopilotPendingAction | null;
    }
  | { type: 'error'; errorCode: ErrorCode; message: string };

class CopilotModelTimeoutError extends Error {
  constructor() {
    super('Copilot model call timed out');
    this.name = 'CopilotModelTimeoutError';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CopilotModelTimeoutError()),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function asArguments(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function toToolErrorPayload(error: unknown): {
  error: string;
  errorCode?: ErrorCode;
} {
  if (error instanceof AppError) {
    return { error: error.message, errorCode: error.errorCode };
  }
  return { error: error instanceof Error ? error.message : String(error) };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Thiếu tham số ${key} trong lời gọi tool Copilot.`,
    );
  }
  return value;
}

function isDraftReminderEmailResult(
  name: string,
  result: unknown,
): result is DraftReminderEmailResult {
  return (
    name === DraftReminderEmailTool.NAME &&
    typeof result === 'object' &&
    result !== null &&
    'draftId' in result
  );
}

type ToolCallRecord = NonNullable<CopilotMessageRecord['toolCalls']>[number];

@Injectable()
export class CopilotChatUseCase {
  constructor(
    @Inject(AI_CHAT_PROVIDER)
    private readonly aiProvider: IAIChatProvider,
    private readonly toolRegistry: CopilotToolRegistry,
    private readonly getReceivableSummaryTool: GetReceivableSummaryTool,
    private readonly getCollectionActivityTimelineTool: GetCollectionActivityTimelineTool,
    private readonly getPaymentHistoryTool: GetPaymentHistoryTool,
    private readonly findOverdueReceivablesTool: FindOverdueReceivablesTool,
    private readonly draftReminderEmailTool: DraftReminderEmailTool,
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly usageLogRepo: IAIUsageLogRepository,
    private readonly planLimitService: PlanLimitService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async persistUserMessage(
    input: CopilotChatInput,
    user: { userId: string; organizationId: string },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.planLimitService.enforceCopilotChatLimit(manager);
      const title = deriveConversationTitle(input.userMessage);
      const conversation = await this.conversationRepo.findOrCreate(
        input.conversationId,
        user.userId,
        title,
        manager,
      );
      if (conversation.userId !== user.userId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Bạn không có quyền truy cập cuộc hội thoại này.',
        );
      }
      await this.conversationRepo.appendMessage(
        {
          conversationId: input.conversationId,
          role: 'USER',
          content: input.userMessage,
          toolCalls: null,
          createdAt: new Date(),
        },
        manager,
      );
    });
  }

  private async callModel(
    messages: AIChatMessage[],
    tools: ReturnType<CopilotToolRegistry['getTools']>,
    conversationId: string,
  ): Promise<AIChatCompletionResult> {
    const startedAt = Date.now();
    try {
      const response = await withTimeout(
        this.aiProvider.createChatCompletion(
          messages,
          tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: { ...tool.function.parameters },
          })),
        ),
        MODEL_CALL_TIMEOUT_MS,
      );
      await this.usageLogRepo.log({
        conversationId,
        model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini',
        promptVersion: PROMPT_VERSION,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: Date.now() - startedAt,
        toolCallsCount: response.toolCalls.length,
        isError: false,
      });
      return response;
    } catch (error) {
      await this.usageLogRepo.log({
        conversationId,
        model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini',
        promptVersion: PROMPT_VERSION,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startedAt,
        toolCallsCount: 0,
        isError: true,
      });
      throw error;
    }
  }

  private async callModelWithRetry(
    messages: AIChatMessage[],
    tools: ReturnType<CopilotToolRegistry['getTools']>,
    conversationId: string,
  ): Promise<AIChatCompletionResult> {
    try {
      return await this.callModel(messages, tools, conversationId);
    } catch (error) {
      if (!(error instanceof CopilotModelTimeoutError)) throw error;
      await delay(MODEL_CALL_RETRY_BACKOFF_MS);
      return this.callModel(messages, tools, conversationId);
    }
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    organizationId: string,
    userId: string,
  ): Promise<unknown> {
    switch (name) {
      case GetReceivableSummaryTool.NAME:
        return this.getReceivableSummaryTool.execute({
          customerId: requiredString(input, 'customerId'),
        });
      case GetCollectionActivityTimelineTool.NAME:
        return this.getCollectionActivityTimelineTool.execute({
          customerId: requiredString(input, 'customerId'),
          limit: typeof input.limit === 'number' ? input.limit : undefined,
        });
      case GetPaymentHistoryTool.NAME:
        return this.getPaymentHistoryTool.execute({
          customerId: requiredString(input, 'customerId'),
          limit: typeof input.limit === 'number' ? input.limit : undefined,
        });
      case FindOverdueReceivablesTool.NAME: {
        const search = input.search;
        if (search !== undefined && typeof search !== 'string') {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Tham số search phải là chuỗi ký tự.',
          );
        }
        const limit = input.limit;
        if (
          limit !== undefined &&
          (typeof limit !== 'number' ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 20)
        ) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Tham số limit phải là số nguyên từ 1 đến 20.',
          );
        }
        return this.findOverdueReceivablesTool.execute({
          search: search !== undefined ? search : undefined,
          limit: limit !== undefined ? limit : undefined,
        });
      }
      case DraftReminderEmailTool.NAME:
        return this.draftReminderEmailTool.execute(
          {
            receivableId: requiredString(input, 'receivableId'),
            subject: requiredString(input, 'subject'),
            bodyHtml: requiredString(input, 'bodyHtml'),
          },
          organizationId,
          userId,
        );
      case SendReminderEmailTool.NAME:
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'sendReminderEmail phải được chặn trước khi thực thi.',
        );
      default:
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Tool Copilot không xác định: "${name}".`,
        );
    }
  }

  // Runs every tool call in a response except sendReminderEmail (which is
  // never executed — it's intercepted into a pending action) and returns
  // each call's result keyed by call id, for both attaching as message
  // output and (for draftReminderEmail) surfacing to the frontend.
  private async runNonSendToolCalls(
    calls: AIToolCall[],
    organizationId: string,
    userId: string,
  ): Promise<Map<string, unknown>> {
    const batchedResults = await Promise.all(
      calls
        .filter((call) => call.name !== SendReminderEmailTool.NAME)
        .map(async (call) => ({
          call,
          result: await this.executeTool(
            call.name,
            call.arguments,
            organizationId,
            userId,
          ).catch(() => null),
        })),
    );
    return new Map(batchedResults.map(({ call, result }) => [call.id, result]));
  }

  // Merges draft results accumulated from earlier iterations of this turn
  // with this response's own tool calls (each looked up in outputByCallId),
  // into the toolCalls array persisted on the turn-ending message.
  private buildToolCallRecords(
    draftToolCalls: ToolCallRecord[],
    calls: AIToolCall[],
    outputByCallId: Map<string, unknown>,
  ): ToolCallRecord[] {
    return [
      ...draftToolCalls,
      ...calls.map((call) => ({
        id: call.id,
        name: call.name,
        input: call.arguments,
        output: outputByCallId.get(call.id) ?? null,
      })),
    ];
  }

  // Appends any successful draftReminderEmail result from this iteration
  // onto the turn's running draftToolCalls accumulator, so it survives to
  // whichever later iteration ends up persisting the turn's message.
  private trackDraftToolCalls(
    calls: AIToolCall[],
    toolResults: Array<{ id: string; result: unknown }>,
    draftToolCalls: ToolCallRecord[],
  ): void {
    for (const call of calls) {
      const toolResult = toolResults.find((r) => r.id === call.id);
      if (
        toolResult &&
        isDraftReminderEmailResult(call.name, toolResult.result)
      ) {
        draftToolCalls.push({
          id: call.id,
          name: call.name,
          input: call.arguments,
          output: toolResult.result,
        });
      }
    }
  }

  private toAiHistory(messages: CopilotMessageRecord[]): AIChatMessage[] {
    return messages.map((message): AIChatMessage => {
      if (message.role === 'TOOL') {
        return {
          role: 'tool',
          content: message.content,
          toolCallId: message.toolCalls?.[0]?.id,
        };
      }
      return {
        role: message.role === 'ASSISTANT' ? 'assistant' : 'user',
        content: message.content,
        toolCalls: message.toolCalls?.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: asArguments(call.input),
        })),
      };
    });
  }

  async execute(input: CopilotChatInput): Promise<CopilotChatResult> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const canSendReminders = ROLE_PERMISSIONS[user.role].includes(
      Permission.REMINDER_SEND_MANUAL,
    );

    await this.persistUserMessage(input, user);

    const messages: AIChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.toAiHistory(
        await this.conversationRepo.listMessages(input.conversationId),
      ),
    ];
    const tools = this.toolRegistry.getTools(canSendReminders);
    const draftToolCalls: ToolCallRecord[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await this.callModelWithRetry(
        messages,
        tools,
        input.conversationId,
      );
      const sendCall = response.toolCalls.find(
        (call) => call.name === SendReminderEmailTool.NAME,
      );

      if (sendCall) {
        const draftId = requiredString(sendCall.arguments, 'draftId');
        const receivableId = requiredString(sendCall.arguments, 'receivableId');
        const outputByCallId = await this.runNonSendToolCalls(
          response.toolCalls,
          user.organizationId,
          user.userId,
        );
        const { pendingAction, saved } = await this.dataSource.transaction(
          async (manager) => {
            const action = await this.pendingActionRepo.create(
              input.conversationId,
              { draftId, receivableId },
              manager,
            );
            const message = await this.conversationRepo.appendMessage(
              {
                conversationId: input.conversationId,
                role: 'ASSISTANT',
                content: response.content ?? '',
                toolCalls: this.buildToolCallRecords(
                  draftToolCalls,
                  response.toolCalls,
                  outputByCallId,
                ),
                createdAt: new Date(),
              },
              manager,
            );
            return { pendingAction: action, saved: message };
          },
        );
        return { message: saved, pendingAction };
      }

      if (response.toolCalls.length === 0) {
        const saved = await this.conversationRepo.appendMessage({
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: response.content ?? '',
          toolCalls: draftToolCalls.length > 0 ? draftToolCalls : null,
          createdAt: new Date(),
        });
        return { message: saved, pendingAction: null };
      }

      const toolResults = await Promise.all(
        response.toolCalls.map(async (call) => ({
          id: call.id,
          result: await this.executeTool(
            call.name,
            call.arguments,
            user.organizationId,
            user.userId,
          ).catch((error: unknown) => toToolErrorPayload(error)),
        })),
      );
      this.trackDraftToolCalls(response.toolCalls, toolResults, draftToolCalls);
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });
      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.result),
          toolCallId: toolResult.id,
        });
      }
    }

    throw new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'Copilot đã vượt quá số vòng xử lý cho một lượt chat.',
    );
  }

  // ponytail: no timeout/retry wrapper and no per-iteration usage logging on
  // the streaming path (unlike callModel/callModelWithRetry) — a silent retry
  // after the user has already seen partial streamed text would be confusing
  // UX, and usage logging can be layered in per-iteration later if cost
  // tracking needs streaming granularity; today's usage limit is enforced by
  // planLimitService inside persistUserMessage before this runs at all.
  async *executeStreaming(
    input: CopilotChatInput,
    isAborted: () => boolean,
  ): AsyncGenerator<CopilotStreamEvent> {
    try {
      const user = this.tenantContext.getCurrentUser();
      if (!user) {
        yield {
          type: 'error',
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'Yêu cầu đăng nhập.',
        };
        return;
      }
      const canSendReminders = ROLE_PERMISSIONS[user.role].includes(
        Permission.REMINDER_SEND_MANUAL,
      );

      const messages: AIChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...this.toAiHistory(
          await this.conversationRepo.listMessages(input.conversationId),
        ),
      ];
      const tools = this.toolRegistry.getTools(canSendReminders);
      const toolSpecs = tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: { ...tool.function.parameters },
      }));
      const draftToolCalls: ToolCallRecord[] = [];

      for (
        let iteration = 0;
        iteration < MAX_TOOL_ITERATIONS && !isAborted();
        iteration += 1
      ) {
        yield { type: 'status', text: 'Đang xử lý…' };

        let content = '';
        const toolCalls: AIToolCall[] = [];
        for await (const chunk of this.aiProvider.streamChatCompletion(
          messages,
          toolSpecs,
        )) {
          if (isAborted()) break;
          if (chunk.contentDelta) {
            content += chunk.contentDelta;
            yield { type: 'delta', text: chunk.contentDelta };
          }
          if (chunk.toolCalls) toolCalls.push(...chunk.toolCalls);
        }
        if (isAborted()) {
          // The client disconnected mid-answer — persist whatever text was
          // already produced so the conversation can be resumed later, but
          // don't bother for an abort that happened before any text arrived.
          if (content) {
            const saved = await this.conversationRepo.appendMessage({
              conversationId: input.conversationId,
              role: 'ASSISTANT',
              content,
              toolCalls: null,
              createdAt: new Date(),
              isPartial: true,
            });
            yield { type: 'done', message: saved, pendingAction: null };
          }
          return;
        }

        const sendCall = toolCalls.find(
          (call) => call.name === SendReminderEmailTool.NAME,
        );
        if (sendCall) {
          const draftId = requiredString(sendCall.arguments, 'draftId');
          const receivableId = requiredString(
            sendCall.arguments,
            'receivableId',
          );
          const outputByCallId = await this.runNonSendToolCalls(
            toolCalls,
            user.organizationId,
            user.userId,
          );
          const { pendingAction, saved } = await this.dataSource.transaction(
            async (manager) => {
              const action = await this.pendingActionRepo.create(
                input.conversationId,
                { draftId, receivableId },
                manager,
              );
              const message = await this.conversationRepo.appendMessage(
                {
                  conversationId: input.conversationId,
                  role: 'ASSISTANT',
                  content,
                  toolCalls: this.buildToolCallRecords(
                    draftToolCalls,
                    toolCalls,
                    outputByCallId,
                  ),
                  createdAt: new Date(),
                },
                manager,
              );
              return { pendingAction: action, saved: message };
            },
          );
          yield { type: 'done', message: saved, pendingAction };
          return;
        }

        if (toolCalls.length === 0) {
          const saved = await this.conversationRepo.appendMessage({
            conversationId: input.conversationId,
            role: 'ASSISTANT',
            content,
            toolCalls: draftToolCalls.length > 0 ? draftToolCalls : null,
            createdAt: new Date(),
          });
          yield { type: 'done', message: saved, pendingAction: null };
          return;
        }

        const toolResults = await Promise.all(
          toolCalls.map(async (call) => ({
            id: call.id,
            result: await this.executeTool(
              call.name,
              call.arguments,
              user.organizationId,
              user.userId,
            ).catch((error: unknown) => toToolErrorPayload(error)),
          })),
        );
        this.trackDraftToolCalls(toolCalls, toolResults, draftToolCalls);
        messages.push({
          role: 'assistant',
          content: content || null,
          toolCalls,
        });
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            toolCallId: toolResult.id,
          });
        }
      }

      if (!isAborted()) {
        yield {
          type: 'error',
          errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Copilot đã vượt quá số vòng xử lý cho một lượt chat.',
        };
      }
    } catch (error) {
      if (error instanceof AppError) {
        yield {
          type: 'error',
          errorCode: error.errorCode,
          message: error.message,
        };
        return;
      }
      yield {
        type: 'error',
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Copilot gặp lỗi không xác định.',
      };
    }
  }
}
