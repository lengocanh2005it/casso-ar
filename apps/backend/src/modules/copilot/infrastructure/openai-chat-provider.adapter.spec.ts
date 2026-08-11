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
});
