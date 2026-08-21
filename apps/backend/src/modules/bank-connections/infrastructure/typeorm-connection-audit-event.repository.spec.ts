import { TypeOrmConnectionAuditEventRepository } from './typeorm-connection-audit-event.repository';

describe('TypeOrmConnectionAuditEventRepository', () => {
  describe('findByBankConnectionIds', () => {
    it('returns matching rows newest-first with a total count, paginated', async () => {
      const rows = [
        {
          id: 'evt-2',
          organizationId: 'org-1',
          bankConnectionId: 'conn-1',
          eventType: 'API_KEY_ROTATED',
          metadata: {},
          createdAt: new Date('2026-01-02'),
        },
      ];
      const findAndCount = jest.fn().mockResolvedValue([rows, 5]);
      const ormRepo = { findAndCount } as never;
      const repo = new TypeOrmConnectionAuditEventRepository(
        ormRepo,
        {} as never,
      );

      const result = await repo.findByBankConnectionIds(
        'org-1',
        ['conn-1'],
        ['API_KEY_ROTATED', 'DISCONNECTED'],
        2,
        20,
      );

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('evt-2');
      expect(findAndCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          bankConnectionId: expect.anything(),
          eventType: expect.anything(),
        },
        order: { createdAt: 'DESC' },
        skip: 20,
        take: 20,
      });
    });

    it('returns an empty page without querying when given no connection ids', async () => {
      const findAndCount = jest.fn();
      const ormRepo = { findAndCount } as never;
      const repo = new TypeOrmConnectionAuditEventRepository(
        ormRepo,
        {} as never,
      );

      const result = await repo.findByBankConnectionIds('org-1', [], [], 1, 20);

      expect(result).toEqual({ items: [], total: 0 });
      expect(findAndCount).not.toHaveBeenCalled();
    });
  });
});
