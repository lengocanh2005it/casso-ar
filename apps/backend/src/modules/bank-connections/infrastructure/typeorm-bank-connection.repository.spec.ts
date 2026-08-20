import { TypeOrmBankConnectionRepository } from './typeorm-bank-connection.repository';

describe('TypeOrmBankConnectionRepository', () => {
  describe('findByAccountNumbers', () => {
    it('returns a map keyed by accountNumber, using a single IN query', async () => {
      const find = jest.fn().mockResolvedValue([
        { id: 'conn-1', accountNumber: '111', organizationId: 'org-1' },
        { id: 'conn-2', accountNumber: '222', organizationId: 'org-2' },
      ]);
      const ormRepo = { find } as never;
      const repo = new TypeOrmBankConnectionRepository(ormRepo, {} as never);

      const result = await repo.findByAccountNumbers(['111', '222', '333']);

      expect(result.size).toBe(2);
      expect(result.get('111')?.id).toBe('conn-1');
      expect(result.get('222')?.id).toBe('conn-2');
      expect(result.has('333')).toBe(false);
      expect(find).toHaveBeenCalledTimes(1);
    });

    it('returns an empty map without querying when given no account numbers', async () => {
      const find = jest.fn();
      const ormRepo = { find } as never;
      const repo = new TypeOrmBankConnectionRepository(ormRepo, {} as never);

      const result = await repo.findByAccountNumbers([]);

      expect(result.size).toBe(0);
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('countActiveByAuthorization', () => {
    it('counts ACTIVE connections scoped to one authorization', async () => {
      const query = jest.fn().mockResolvedValue([{ count: '3' }]);
      const manager = { query } as never;
      const repo = new TypeOrmBankConnectionRepository(
        {} as never,
        {} as never,
      );

      const result = await repo.countActiveByAuthorization('auth-1', manager);

      expect(result).toBe(3);
      expect(query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM bank_connections WHERE "cassoFlowAuthorizationId" = $1 AND status = $2',
        ['auth-1', 'ACTIVE'],
      );
    });
  });
});
