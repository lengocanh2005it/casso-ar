import { TypeOrmWebhookInboxRepository } from './typeorm-webhook-inbox.repository';

describe('TypeOrmWebhookInboxRepository.deleteOlderThan', () => {
  it('deletes rows with receivedAt older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 9 });
    const repo = new TypeOrmWebhookInboxRepository({
      delete: deleteMock,
    } as any);
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      receivedAt: expect.objectContaining({
        _type: 'lessThan',
        _value: cutoff,
      }),
    });
    expect(result).toBe(9);
  });
});
