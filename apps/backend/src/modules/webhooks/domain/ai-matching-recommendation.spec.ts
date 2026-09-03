import {
  AI_MATCHING_PROMPT_VERSION,
  createAiMatchingRecommendation,
} from './ai-matching-recommendation';

const evaluatedAt = '2026-09-03T00:00:00.000Z';

describe('createAiMatchingRecommendation', () => {
  it('accepts succeeded recommendations with an offered candidate and confidence from 70 to 100', () => {
    expect(
      createAiMatchingRecommendation({
        status: 'SUCCEEDED',
        recommendedReceivableId: 'receivable-1',
        confidence: 70,
        reason: 'Trùng số hóa đơn',
        model: 'gpt-4o-mini',
        promptVersion: AI_MATCHING_PROMPT_VERSION,
        evaluatedAt,
      }),
    ).toMatchObject({ status: 'SUCCEEDED', confidence: 70 });
    expect(() =>
      createAiMatchingRecommendation({
        status: 'SUCCEEDED',
        recommendedReceivableId: 'receivable-1',
        confidence: 69,
        reason: 'Trùng số hóa đơn',
        model: 'gpt-4o-mini',
        promptVersion: AI_MATCHING_PROMPT_VERSION,
        evaluatedAt,
      }),
    ).toThrow('confidence');
  });

  it('enforces candidate, nullable-field, and failure-code rules by status', () => {
    expect(() =>
      createAiMatchingRecommendation({
        status: 'UNKNOWN' as never,
        recommendedReceivableId: null,
        confidence: null,
        reason: null,
        model: 'gpt-4o-mini',
        promptVersion: AI_MATCHING_PROMPT_VERSION,
        evaluatedAt,
      }),
    ).toThrow('status');
    expect(() =>
      createAiMatchingRecommendation({
        status: 'ABSTAINED',
        recommendedReceivableId: 'receivable-1',
        confidence: null,
        reason: null,
        model: 'gpt-4o-mini',
        promptVersion: AI_MATCHING_PROMPT_VERSION,
        evaluatedAt,
      }),
    ).toThrow('candidate');
    expect(() =>
      createAiMatchingRecommendation({
        status: 'FAILED',
        recommendedReceivableId: null,
        confidence: 70,
        reason: null,
        model: 'gpt-4o-mini',
        promptVersion: AI_MATCHING_PROMPT_VERSION,
        evaluatedAt,
        failureCode: 'TIMEOUT',
      }),
    ).toThrow('FAILED');
  });

  it('sanitizes reasons to plain text without control characters and at most 240 characters', () => {
    const recommendation = createAiMatchingRecommendation({
      status: 'SUCCEEDED',
      recommendedReceivableId: 'receivable-1',
      confidence: 100,
      reason: `  Hợp lệ\u0000${'a'.repeat(300)}  `,
      model: 'gpt-4o-mini',
      promptVersion: AI_MATCHING_PROMPT_VERSION,
      evaluatedAt,
    });

    expect(recommendation.reason).toHaveLength(240);
    expect(
      Array.from(recommendation.reason).every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      }),
    ).toBe(true);
  });
});
