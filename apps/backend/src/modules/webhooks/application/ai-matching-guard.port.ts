export interface AiMatchingGuardInput {
  webhookInboxId: string;
  organizationId: string;
}

export type AiMatchingGuardSkipReason =
  | 'feature-disabled'
  | 'duplicate'
  | 'concurrency-limit'
  | 'daily-limit'
  | 'redis-unavailable';

export type AiMatchingGuardResult<T> =
  | { outcome: 'executed'; value: T }
  | { outcome: 'skipped'; reason: AiMatchingGuardSkipReason };

export interface IAiMatchingGuard {
  run<T>(
    input: AiMatchingGuardInput,
    operation: () => Promise<T>,
  ): Promise<AiMatchingGuardResult<T>>;
}

export const AI_MATCHING_GUARD = Symbol('AI_MATCHING_GUARD');
