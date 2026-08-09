export interface AIUsageLogEntry {
  conversationId: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  toolCallsCount: number;
  isError: boolean;
}

export interface IAIUsageLogRepository {
  log(entry: AIUsageLogEntry): Promise<void>;
}

export const AI_USAGE_LOG_REPOSITORY = Symbol('AI_USAGE_LOG_REPOSITORY');
