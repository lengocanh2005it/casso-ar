export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: AIToolCall[];
  toolCallId?: string;
}

export interface AIToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIChatCompletionResult {
  content: string | null;
  toolCalls: AIToolCall[];
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AIStreamChunk {
  contentDelta: string | null;
  toolCalls: AIToolCall[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface CreateChatCompletionOptions {
  signal?: AbortSignal;
  toolChoice?: 'auto' | 'required' | 'none';
  maxOutputTokens?: number;
}

export interface IAIChatProvider {
  createChatCompletion(
    messages: AIChatMessage[],
    tools: AIToolSpec[],
    options?: CreateChatCompletionOptions,
  ): Promise<AIChatCompletionResult>;
  streamChatCompletion(
    messages: AIChatMessage[],
    tools: AIToolSpec[],
    options?: CreateChatCompletionOptions,
  ): AsyncIterable<AIStreamChunk>;
}

export const AI_CHAT_PROVIDER = Symbol('AI_CHAT_PROVIDER');
