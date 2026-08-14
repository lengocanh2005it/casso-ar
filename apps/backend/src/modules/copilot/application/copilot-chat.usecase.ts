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
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';
import { DraftReminderEmailTool } from './tools/draft-reminder-email.tool';
import { GetCollectionActivityTimelineTool } from './tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './tools/get-payment-history.tool';
import { GetReceivableSummaryTool } from './tools/get-receivable-summary.tool';
import { SendReminderEmailTool } from './tools/send-reminder-email.tool';

const PROMPT_VERSION = 'copilot-v1';
const MODEL_CALL_TIMEOUT_MS = 15_000;
const MAX_TOOL_ITERATIONS = 5;
const SYSTEM_PROMPT = [
  'You are an AI assistant for collections accounting (Collection Copilot).',
  'You may ONLY answer based on structured JSON data returned by read tools — do not invent figures.',
  'If the user wants to send a reminder email, call draftReminderEmail first to create a draft, then call sendReminderEmail to propose sending it — the user must separately confirm the actual send; you do not send it yourself.',
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Copilot model call timed out')),
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

@Injectable()
export class CopilotChatUseCase {
  constructor(
    @Inject(AI_CHAT_PROVIDER)
    private readonly aiProvider: IAIChatProvider,
    private readonly toolRegistry: CopilotToolRegistry,
    private readonly getReceivableSummaryTool: GetReceivableSummaryTool,
    private readonly getCollectionActivityTimelineTool: GetCollectionActivityTimelineTool,
    private readonly getPaymentHistoryTool: GetPaymentHistoryTool,
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
    } catch {
      return this.callModel(messages, tools, conversationId);
    }
  }

  private executeTool(
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
      case DraftReminderEmailTool.NAME:
        return this.draftReminderEmailTool.execute(
          {
            receivableId: requiredString(input, 'receivableId'),
            tone: input.tone === 'urgent' ? 'urgent' : 'polite',
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

    await this.dataSource.transaction(async (manager) => {
      await this.planLimitService.enforceCopilotChatLimit(manager);
      const conversation = await this.conversationRepo.findOrCreate(
        input.conversationId,
        user.userId,
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

    const messages: AIChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.toAiHistory(
        await this.conversationRepo.listMessages(input.conversationId),
      ),
    ];
    const tools = this.toolRegistry.getTools(canSendReminders);

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
        // Other tool calls the model batched into the same response still run
        // and their results are recorded — only sendReminderEmail is halted.
        await Promise.all(
          response.toolCalls
            .filter((call) => call.name !== SendReminderEmailTool.NAME)
            .map((call) =>
              this.executeTool(
                call.name,
                call.arguments,
                user.organizationId,
                user.userId,
              ),
            ),
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
                toolCalls: response.toolCalls.map((call) => ({
                  id: call.id,
                  name: call.name,
                  input: call.arguments,
                })),
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
          toolCalls: null,
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
          ),
        })),
      );
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
}
