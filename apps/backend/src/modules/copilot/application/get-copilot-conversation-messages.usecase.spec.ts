import { GetCopilotConversationMessagesUseCase } from './get-copilot-conversation-messages.usecase';

describe('GetCopilotConversationMessagesUseCase', () => {
  it('returns messages for a conversation the current user owns', async () => {
    const messages = [{ id: 'm1' }];
    const conversationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'c1', userId: 'user-1' }),
      listMessages: jest.fn().mockResolvedValue(messages),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new GetCopilotConversationMessagesUseCase(
      conversationRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('c1')).resolves.toBe(messages);
  });

  it('throws NOT_FOUND when the conversation does not exist in the org', async () => {
    const conversationRepo = {
      findById: jest.fn().mockResolvedValue(null),
      listMessages: jest.fn(),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new GetCopilotConversationMessagesUseCase(
      conversationRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when the conversation belongs to another user', async () => {
    const conversationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'c1', userId: 'other-user' }),
      listMessages: jest.fn(),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new GetCopilotConversationMessagesUseCase(
      conversationRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('c1')).rejects.toMatchObject({
      errorCode: 'FORBIDDEN',
    });
    expect(conversationRepo.listMessages).not.toHaveBeenCalled();
  });
});
