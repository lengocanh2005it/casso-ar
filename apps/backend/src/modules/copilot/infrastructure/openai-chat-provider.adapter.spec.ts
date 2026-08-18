const mockCreateCompletion = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: class MockOpenAI {
    chat = { completions: { create: mockCreateCompletion } };
  },
}));

import { OpenAiChatProviderAdapter } from './openai-chat-provider.adapter';

describe('OpenAiChatProviderAdapter', () => {
  beforeEach(() => {
    mockCreateCompletion.mockReset();
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_BASE_URL = 'https://provider.test/v1';
    process.env.AI_PROVIDER_MODEL = 'test-model';
  });

  it('maps provider messages, tools, and usage into the application port', async () => {
    mockCreateCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Done',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'getReceivableSummary',
                  arguments: '{"customerId":"customer-1"}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 7 },
    });
    const adapter = new OpenAiChatProviderAdapter();

    const result = await adapter.createChatCompletion(
      [{ role: 'user', content: 'Show summary' }],
      [
        {
          name: 'getReceivableSummary',
          description: 'Summary',
          parameters: { type: 'object' },
        },
      ],
    );

    expect(mockCreateCompletion).toHaveBeenCalledWith({
      model: 'test-model',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Show summary' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'getReceivableSummary',
            description: 'Summary',
            parameters: { type: 'object' },
          },
        },
      ],
      tool_choice: 'auto',
    });
    expect(result).toEqual({
      content: 'Done',
      toolCalls: [
        {
          id: 'call-1',
          name: 'getReceivableSummary',
          arguments: { customerId: 'customer-1' },
        },
      ],
      inputTokens: 12,
      outputTokens: 7,
    });
  });

  it('rejects malformed tool arguments', async () => {
    mockCreateCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'tool', arguments: '[]' },
              },
            ],
          },
        },
      ],
    });
    const adapter = new OpenAiChatProviderAdapter();

    await expect(adapter.createChatCompletion([], [])).rejects.toThrow(
      'Invalid arguments for Copilot tool "tool"',
    );
  });

  describe('streamChatCompletion', () => {
    async function* fakeStream(parts: unknown[]) {
      for (const part of parts) yield part;
    }

    it('yields content deltas as they arrive', async () => {
      mockCreateCompletion.mockResolvedValue(
        fakeStream([
          { choices: [{ delta: { content: 'Xin ' } }] },
          { choices: [{ delta: { content: 'chào' } }] },
          {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 5, completion_tokens: 2 },
          },
        ]),
      );
      const adapter = new OpenAiChatProviderAdapter();

      const chunks = [];
      for await (const chunk of adapter.streamChatCompletion(
        [{ role: 'user', content: 'Chào' }],
        [],
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        {
          contentDelta: 'Xin ',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
        {
          contentDelta: 'chào',
          toolCalls: null,
          inputTokens: null,
          outputTokens: null,
        },
        {
          contentDelta: null,
          toolCalls: null,
          inputTokens: 5,
          outputTokens: 2,
        },
      ]);
    });

    it('accumulates tool-call argument deltas by index into the final chunk', async () => {
      mockCreateCompletion.mockResolvedValue(
        fakeStream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-1',
                      function: { name: 'getReceivableSummary', arguments: '' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '{"customerId":' } },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: '"c1"}' } }],
                },
              },
            ],
          },
        ]),
      );
      const adapter = new OpenAiChatProviderAdapter();

      const chunks = [];
      for await (const chunk of adapter.streamChatCompletion([], [])) {
        chunks.push(chunk);
      }

      expect(chunks.at(-1)).toEqual({
        contentDelta: null,
        toolCalls: [
          {
            id: 'call-1',
            name: 'getReceivableSummary',
            arguments: { customerId: 'c1' },
          },
        ],
        inputTokens: null,
        outputTokens: null,
      });
    });
  });
});
