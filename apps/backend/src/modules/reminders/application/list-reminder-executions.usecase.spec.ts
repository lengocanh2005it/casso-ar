import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import { ListReminderExecutionUseCase } from './list-reminder-executions.usecase';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';

describe('ListReminderExecutionUseCase', () => {
  it('delegates to the execution repository findPage', async () => {
    const mockItems = [
      { id: 'exec-1', status: 'SENT' },
      { id: 'exec-2', status: 'FAILED' },
    ];
    const executionRepo = {
      findPage: jest.fn().mockResolvedValue({ items: mockItems, total: 2 }),
    };
    const useCase = new ListReminderExecutionUseCase(
      executionRepo as unknown as IReminderExecutionRepository,
    );

    const result = await useCase.execute({
      receivableId: 'rec-1',
      page: 1,
      limit: 20,
    });

    expect(executionRepo.findPage).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      page: 1,
      limit: 20,
    });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
