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

  it('maps an explicit tool choice and abort signal to the provider', async () => {
    mockCreateCompletion.mockResolvedValue({
      choices: [{ message: { content: null, tool_calls: [] } }],
    });
    const adapter = new OpenAiChatProviderAdapter();
    const controller = new AbortController();

    await adapter.createChatCompletion(
      [{ role: 'user', content: 'Choose one candidate' }],
      [
        {
          name: 'recommendMatch',
          description: 'Recommend a match',
          parameters: { type: 'object' },
        },
      ],
      { signal: controller.signal, toolChoice: 'required' },
    );

    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: 'required',
      }),
      { signal: controller.signal },
    );
  });
});
