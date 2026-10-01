import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  AIChatCompletionResult,
  AIChatMessage,
  AIStreamChunk,
  AIToolSpec,
  CreateChatCompletionOptions,
  IAIChatProvider,
} from './ai-chat-provider.port';

@Injectable()
export class OpenAiChatProviderAdapter implements IAIChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_PROVIDER_API_KEY ?? 'ai_missing_key',
      baseURL: process.env.AI_PROVIDER_BASE_URL,
    });
    this.model = process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini';
  }

  async createChatCompletion(
    messages: AIChatMessage[],
    tools: AIToolSpec[],
    options?: CreateChatCompletionOptions,
  ): Promise<AIChatCompletionResult> {
    const request = this.createRequest(messages, tools, options);
    const response = options?.signal
      ? await this.client.chat.completions.create(request, {
          signal: options.signal,
        })
      : await this.client.chat.completions.create(request);
    const choice = response.choices[0];
    if (!choice) throw new Error('Copilot provider returned no choices');

    return {
      content: choice.message.content,
      toolCalls: (choice.message.tool_calls ?? [])
        .filter((call) => call.type === 'function')
        .map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: this.parseArguments(
            call.function.arguments,
            call.function.name,
          ),
        })),
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
    };
  }

  async *streamChatCompletion(
    messages: AIChatMessage[],
    tools: AIToolSpec[],
    options?: CreateChatCompletionOptions,
  ): AsyncIterable<AIStreamChunk> {
    const request = {
      ...this.createRequest(messages, tools, options),
      stream: true as const,
      stream_options: { include_usage: true },
    };
    const stream = options?.signal
      ? await this.client.chat.completions.create(request, {
          signal: options.signal,
        })
      : await this.client.chat.completions.create(request);

    const toolCallBuffers = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    for await (const part of stream) {
      const delta = part.choices[0]?.delta;
      if (delta?.content) {
        yield {
          contentDelta: delta.content,
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        };
      }
      for (const toolCallDelta of delta?.tool_calls ?? []) {
        const existing = toolCallBuffers.get(toolCallDelta.index) ?? {
          id: '',
          name: '',
          arguments: '',
        };
        if (toolCallDelta.id) existing.id = toolCallDelta.id;
        if (toolCallDelta.function?.name)
          existing.name = toolCallDelta.function.name;
        if (toolCallDelta.function?.arguments)
          existing.arguments += toolCallDelta.function.arguments;
        toolCallBuffers.set(toolCallDelta.index, existing);
      }
      if (part.usage) {
        inputTokens = part.usage.prompt_tokens;
        outputTokens = part.usage.completion_tokens;
      }
    }

    const toolCalls = toolCallBuffers.size
      ? Array.from(toolCallBuffers.values()).map((call) => ({
          id: call.id,
          name: call.name,
          arguments: this.parseArguments(call.arguments, call.name),
        }))
      : null;

    yield { contentDelta: null, toolCalls, inputTokens, outputTokens };
  }

  private createRequest(
    messages: AIChatMessage[],
    tools: AIToolSpec[],
    options?: CreateChatCompletionOptions,
  ) {
    return {
      model: this.model,
      max_tokens: options?.maxOutputTokens ?? 1024,
      messages: messages.map((message) => this.toOpenAiMessage(message)),
      tools: tools.length
        ? tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }))
        : undefined,
      tool_choice: options?.toolChoice ?? (tools.length ? 'auto' : undefined),
    };
  }

  private parseArguments(
    rawArguments: string,
    toolName: string,
  ): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('not an object');
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid arguments for Copilot tool "${toolName}"`);
    }
  }

  private toOpenAiMessage(
    message: AIChatMessage,
  ): OpenAI.Chat.ChatCompletionMessageParam {
    if (message.role === 'tool')
      return {
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: message.content ?? '',
      };
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        })),
      };
    }
    return { role: message.role, content: message.content ?? '' };
  }
}
