import type {
  AIChatCompletionResult,
  AIChatMessage,
  AIToolSpec,
  IAIChatProvider,
} from '../../../common/ai/ai-chat-provider.port';
import type { JsonLogger } from '../../../common/observability/json-logger.service';
import type {
  AiMatchingGuardResult,
  IAiMatchingGuard,
} from './ai-matching-guard.port';
import {
  type MatchingAiCandidate,
  MatchingAiRecommendationService,
} from './matching-ai-recommendation.service';

const candidate = (overrides: Partial<MatchingAiCandidate> = {}) => ({
  receivableId: 'receivable-1',
  customerId: 'customer-1',
  invoiceNumber: 'INV-001',
  customerName: 'Nguyen Van A',
  remainingAmount: 10_000_000,
  dueDate: new Date('2026-08-01T00:00:00.000Z'),
  totalScore: 75,
  ...overrides,
});

const input = {
  organizationId: 'org-secret',
  webhookInboxId: 'webhook-secret',
  transaction: {
    amount: 10_000_000,
    transactionDateTime: new Date('2026-08-02T10:00:00.000Z'),
    counterpartyAccountNumber: '123456789012',
    counterpartyName: 'Payer',
    transferContent: 'Thanh toan INV-001',
  },
  candidates: [
    candidate(),
    candidate({
      receivableId: 'receivable-2',
      invoiceNumber: 'INV-002',
      totalScore: 70,
    }),
  ],
};

class FakeProvider implements IAIChatProvider {
  readonly calls: Array<{
    messages: AIChatMessage[];
    tools: AIToolSpec[];
  }> = [];
  responses: AIChatCompletionResult[] = [];
  errors: unknown[] = [];
  neverResolves = false;

  async createChatCompletion(
    messages: AIChatMessage[],
    tools: AIToolSpec[],
  ): Promise<AIChatCompletionResult> {
    this.calls.push({ messages, tools });
    if (this.neverResolves) return new Promise(() => undefined);
    const error = this.errors.shift();
    if (error) throw error;
    const response = this.responses.shift();
    if (!response) throw new Error('missing fake response');
    return response;
  }

  async *streamChatCompletion(): AsyncIterable<never> {
    yield* [];
  }
}

class AlwaysExecuteGuard implements IAiMatchingGuard {
  async run<T>(
    _input: { webhookInboxId: string; organizationId: string },
    operation: () => Promise<T>,
  ): Promise<AiMatchingGuardResult<T>> {
    return { outcome: 'executed', value: await operation() };
  }
}

function createService(
  provider: FakeProvider,
  guard: IAiMatchingGuard = new AlwaysExecuteGuard(),
  values: Record<string, string> = {},
): MatchingAiRecommendationService {
  return new MatchingAiRecommendationService(
    provider,
    guard,
    {
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    } as never,
    {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never as JsonLogger,
  );
}

function toolResponse(args: Record<string, unknown>): AIChatCompletionResult {
  return {
    content: null,
    toolCalls: [
      { id: 'tool-1', name: 'matching_recommendation', arguments: args },
    ],
    inputTokens: null,
    outputTokens: null,
  };
}

describe('MatchingAiRecommendationService', () => {
  it('returns a candidate recommendation and sends only bounded evidence', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      toolResponse({
        candidate: 'C2',
        confidence: 80,
        reason: 'Tên và số tiền phù hợp.',
      }),
    ];
    const service = createService(provider);

    const recommendation = await service.evaluate(input);

    expect(recommendation).toMatchObject({
      status: 'SUCCEEDED',
      recommendedReceivableId: 'receivable-2',
      confidence: 80,
      reason: 'Tên và số tiền phù hợp.',
    });
    expect(provider.calls[0]?.tools[0]?.name).toBe('matching_recommendation');
    const serialized = JSON.stringify(provider.calls[0]?.messages);
    expect(serialized).toContain('C1');
    expect(serialized).toContain('C2');
    expect(serialized).not.toContain('receivable-1');
    expect(serialized).not.toContain('org-secret');
    expect(serialized).not.toContain('webhook-secret');
    expect(serialized).toContain('9012');
    expect(serialized).not.toContain('123456789012');
  });

  it('returns an abstention without inventing a candidate', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      toolResponse({
        candidate: 'ABSTAIN',
        confidence: 40,
        reason: 'Không đủ dữ kiện.',
      }),
    ];

    await expect(
      createService(provider).evaluate(input),
    ).resolves.toMatchObject({
      status: 'ABSTAINED',
      recommendedReceivableId: null,
      confidence: 40,
      reason: 'Không đủ dữ kiện.',
    });
  });

  it('abstains below the match threshold and fails closed for other invalid output', async () => {
    const cases: AIChatCompletionResult[] = [
      {
        ...toolResponse({ candidate: 'C1', confidence: 60, reason: 'too low' }),
      },
      {
        ...toolResponse({ candidate: 'C1', confidence: 90, reason: 'ok' }),
        toolCalls: [
          ...toolResponse({ candidate: 'C1', confidence: 90, reason: 'ok' })
            .toolCalls,
          { id: 'tool-2', name: 'matching_recommendation', arguments: {} },
        ],
      },
      toolResponse({ candidate: 'C5', confidence: 90, reason: 'not offered' }),
    ];

    const lowConfidenceProvider = new FakeProvider();
    lowConfidenceProvider.responses = [cases[0]];
    await expect(
      createService(lowConfidenceProvider).evaluate(input),
    ).resolves.toMatchObject({
      status: 'ABSTAINED',
      recommendedReceivableId: null,
      confidence: 60,
    });

    for (const response of cases.slice(1)) {
      const provider = new FakeProvider();
      provider.responses = [response];
      await expect(
        createService(provider).evaluate(input),
      ).resolves.toMatchObject({
        status: 'FAILED',
        failureCode: 'INVALID_OUTPUT',
      });
    }
  });

  it('retries one transient provider error and then succeeds', async () => {
    const provider = new FakeProvider();
    provider.errors = [{ status: 503 }];
    provider.responses = [
      toolResponse({ candidate: 'C1', confidence: 70, reason: 'Khớp.' }),
    ];

    const recommendation = await createService(provider).evaluate(input);

    expect(recommendation).toMatchObject({
      status: 'SUCCEEDED',
      confidence: 70,
    });
    expect(provider.calls).toHaveLength(2);
  });

  it('retries once after a provider timeout', async () => {
    jest.useFakeTimers();
    try {
      const provider = new FakeProvider();
      provider.neverResolves = true;
      const evaluation = createService(provider, undefined, {
        AI_MATCHING_TIMEOUT_MS: '1000',
      }).evaluate(input);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);

      await expect(evaluation).resolves.toMatchObject({
        status: 'FAILED',
        failureCode: 'TIMEOUT',
      });
      expect(provider.calls).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('converts a permanent provider error to a stable failure code', async () => {
    const provider = new FakeProvider();
    provider.errors = [{ status: 401 }];

    await expect(
      createService(provider).evaluate(input),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('returns null when the guard skips the provider', async () => {
    const provider = new FakeProvider();
    const guard: IAiMatchingGuard = {
      run: jest.fn().mockResolvedValue({
        outcome: 'skipped',
        reason: 'daily-limit',
      }),
    };

    await expect(
      createService(provider, guard).evaluate(input),
    ).resolves.toBeNull();
    expect(provider.calls).toHaveLength(0);
  });

  it('sanitizes control characters and truncates transfer content', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      toolResponse({ candidate: 'C1', confidence: 70, reason: 'ok' }),
    ];
    const longContent = `${'x'.repeat(600)}\u0000 injected instruction`;

    await createService(provider).evaluate({
      ...input,
      transaction: { ...input.transaction, transferContent: longContent },
    });

    const serialized = JSON.stringify(provider.calls[0]?.messages);
    expect(serialized).not.toContain('injected instruction');
    expect(serialized).not.toContain('\\u0000');
    expect(serialized).toContain('x'.repeat(500));
  });
});
