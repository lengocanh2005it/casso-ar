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

export interface AIUsageByOrgAndModel {
  organizationId: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

export interface AIUsageDailyTrendPoint {
  date: string;
  requestCount: number;
  totalTokens: number;
}

export interface IAIUsageLogRepository {
  log(entry: AIUsageLogEntry): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
  aggregateByOrgAndModel(from: Date, to: Date): Promise<AIUsageByOrgAndModel[]>;
  aggregateDailyTrend(from: Date, to: Date): Promise<AIUsageDailyTrendPoint[]>;
}

export const AI_USAGE_LOG_REPOSITORY = Symbol('AI_USAGE_LOG_REPOSITORY');
