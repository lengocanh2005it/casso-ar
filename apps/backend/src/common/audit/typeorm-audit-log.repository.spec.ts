import { TypeOrmAuditLogRepository } from './typeorm-audit-log.repository';

describe('TypeOrmAuditLogRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 42 });
    const repo = new TypeOrmAuditLogRepository({ delete: deleteMock } as any);
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(42);
  });

  it('returns 0 when nothing was deleted', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: null });
    const repo = new TypeOrmAuditLogRepository({ delete: deleteMock } as any);

    const result = await repo.deleteOlderThan(new Date());

    expect(result).toBe(0);
  });
});
