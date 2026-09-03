export const AI_MATCHING_PROMPT_VERSION = 'matching-v1';

export type AiRecommendationStatus = 'SUCCEEDED' | 'ABSTAINED' | 'FAILED';

export type AiMatchingFailureCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_OUTPUT'
  | 'QUOTA_EXCEEDED'
  | 'LOCK_UNAVAILABLE';

interface AiMatchingRecommendationBase {
  model: string;
  promptVersion: typeof AI_MATCHING_PROMPT_VERSION;
  evaluatedAt: string;
}

export interface SucceededAiMatchingRecommendation
  extends AiMatchingRecommendationBase {
  status: 'SUCCEEDED';
  recommendedReceivableId: string;
  confidence: number;
  reason: string;
  failureCode?: never;
}

export interface AbstainedAiMatchingRecommendation
  extends AiMatchingRecommendationBase {
  status: 'ABSTAINED';
  recommendedReceivableId: null;
  confidence: number | null;
  reason: string | null;
  failureCode?: never;
}

export interface FailedAiMatchingRecommendation
  extends AiMatchingRecommendationBase {
  status: 'FAILED';
  recommendedReceivableId: null;
  confidence: null;
  reason: null;
  failureCode: AiMatchingFailureCode;
}

export type AiMatchingRecommendation =
  | SucceededAiMatchingRecommendation
  | AbstainedAiMatchingRecommendation
  | FailedAiMatchingRecommendation;

export interface AiMatchingRecommendationInput {
  status: AiRecommendationStatus;
  recommendedReceivableId: string | null;
  confidence: number | null;
  reason: string | null;
  model: string;
  promptVersion: typeof AI_MATCHING_PROMPT_VERSION;
  evaluatedAt: string;
  failureCode?: AiMatchingFailureCode;
}

const MAX_REASON_LENGTH = 240;

function sanitizeReason(reason: string): string {
  return Array.from(reason)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim()
    .slice(0, MAX_REASON_LENGTH);
}

function assertConfidence(
  confidence: number | null,
  minimum: number,
): asserts confidence is number {
  if (
    typeof confidence !== 'number' ||
    !Number.isInteger(confidence) ||
    confidence < minimum ||
    confidence > 100
  ) {
    throw new Error('AI matching recommendation confidence is invalid');
  }
}

export function createAiMatchingRecommendation(
  input: AiMatchingRecommendationInput,
): AiMatchingRecommendation {
  if (input.status === 'SUCCEEDED') {
    if (!input.recommendedReceivableId) {
      throw new Error(
        'A succeeded AI matching recommendation requires a candidate',
      );
    }
    assertConfidence(input.confidence, 70);
    if (typeof input.reason !== 'string') {
      throw new Error(
        'A succeeded AI matching recommendation requires a reason',
      );
    }
    return {
      status: input.status,
      recommendedReceivableId: input.recommendedReceivableId,
      confidence: input.confidence,
      reason: sanitizeReason(input.reason),
      model: input.model,
      promptVersion: input.promptVersion,
      evaluatedAt: input.evaluatedAt,
    };
  }

  if (input.status === 'ABSTAINED') {
    if (input.recommendedReceivableId !== null) {
      throw new Error(
        'An abstained AI matching recommendation cannot have a candidate',
      );
    }
    if (input.confidence !== null) assertConfidence(input.confidence, 0);
    return {
      status: input.status,
      recommendedReceivableId: null,
      confidence: input.confidence,
      reason: input.reason === null ? null : sanitizeReason(input.reason),
      model: input.model,
      promptVersion: input.promptVersion,
      evaluatedAt: input.evaluatedAt,
    };
  }

  if (input.status === 'FAILED') {
    if (
      input.recommendedReceivableId !== null ||
      input.confidence !== null ||
      input.reason !== null ||
      !input.failureCode
    ) {
      throw new Error(
        'A FAILED AI matching recommendation only contains a failure code',
      );
    }
    return {
      status: input.status,
      recommendedReceivableId: null,
      confidence: null,
      reason: null,
      model: input.model,
      promptVersion: input.promptVersion,
      evaluatedAt: input.evaluatedAt,
      failureCode: input.failureCode,
    };
  }

  throw new Error('AI matching recommendation status is invalid');
}
