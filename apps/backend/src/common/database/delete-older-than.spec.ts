import { deleteOlderThan } from './delete-older-than';

interface FakeRow {
  createdAt: Date;
  status: string;
}

describe('deleteOlderThan', () => {
  it('deletes rows where the given field is older than cutoff and returns the count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 42 });
    const repo = { delete: deleteMock } as any;
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await deleteOlderThan<FakeRow>(repo, 'createdAt', cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(42);
  });

  it('merges extra where conditions with the cutoff', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 3 });
    const repo = { delete: deleteMock } as any;
    const cutoff = new Date('2026-01-01T00:00:00Z');

    await deleteOlderThan<FakeRow>(repo, 'createdAt', cutoff, {
      status: 'PENDING',
    });

    expect(deleteMock).toHaveBeenCalledWith({
      status: 'PENDING',
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
  });

  it('returns 0 when nothing was deleted', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: null });
    const repo = { delete: deleteMock } as any;

    const result = await deleteOlderThan<FakeRow>(
      repo,
      'createdAt',
      new Date(),
    );

    expect(result).toBe(0);
  });
});
