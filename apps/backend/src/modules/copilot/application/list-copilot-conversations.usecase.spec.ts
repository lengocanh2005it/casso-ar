import { AppError } from '../../../common/errors/app-error';
import { ListCopilotConversationsUseCase } from './list-copilot-conversations.usecase';

describe('ListCopilotConversationsUseCase', () => {
  it('lists conversations for the current user', async () => {
    const page = { items: [], total: 0 };
    const conversationRepo = { listByUser: jest.fn().mockResolvedValue(page) };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new ListCopilotConversationsUseCase(
      conversationRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute(2, 10)).resolves.toBe(page);
    expect(conversationRepo.listByUser).toHaveBeenCalledWith('user-1', 2, 10);
  });

  it('rejects when there is no authenticated user', async () => {
    const conversationRepo = { listByUser: jest.fn() };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue(null) };
    const useCase = new ListCopilotConversationsUseCase(
      conversationRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute(1, 20)).rejects.toBeInstanceOf(AppError);
    expect(conversationRepo.listByUser).not.toHaveBeenCalled();
  });
});
