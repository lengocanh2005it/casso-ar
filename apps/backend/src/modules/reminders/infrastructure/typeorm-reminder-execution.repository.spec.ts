import { TypeOrmReminderExecutionRepository } from './typeorm-reminder-execution.repository';

describe('TypeOrmReminderExecutionRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 23 });
    const getRepository = jest.fn().mockReturnValue({ delete: deleteMock });
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository } as any,
      { getOrganizationId: jest.fn() } as any,
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(23);
  });
});
