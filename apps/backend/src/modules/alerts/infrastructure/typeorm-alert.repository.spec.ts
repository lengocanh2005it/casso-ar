import { IsNull } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import { Alert, AlertType } from '../domain/alert';
import { TypeOrmAlertRepository } from './typeorm-alert.repository';

function buildAlert(
  overrides: Partial<ConstructorParameters<typeof Alert>[0]> = {},
) {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.BANK_CONNECTION_ERROR,
    entityType: 'bank_connection',
    entityId: 'conn-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    ...overrides,
  });
}

function buildDataSource() {
  const query = jest.fn().mockResolvedValue(undefined);
  const transaction = jest.fn((callback) => callback({ query }));
  return { dataSource: { transaction } as any, query };
}

function buildTenantContext(organizationId = 'org-1') {
  return { getOrganizationId: jest.fn(() => organizationId) } as any;
}

describe('TypeOrmAlertRepository', () => {
  describe('upsertUnread', () => {
    it('runs the partial-unique-index upsert inside a transaction with the alert fields as params', async () => {
      const { dataSource, query } = buildDataSource();
      const ormRepo = {} as any;
      const repo = new TypeOrmAlertRepository(
        ormRepo,
        dataSource,
        buildTenantContext(),
      );
      const alert = buildAlert();

      await repo.upsertUnread(alert);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(
          'ON CONFLICT ("userId", "entityType", "entityId", "type") WHERE "readAt" IS NULL',
        ),
        [
          'alert-1',
          'org-1',
          'user-1',
          AlertType.BANK_CONNECTION_ERROR,
          'bank_connection',
          'conn-1',
          alert.createdAt,
        ],
      );
    });

    it('throws TENANT_MISMATCH when the alert organizationId does not match the tenant context', async () => {
      const { dataSource } = buildDataSource();
      const ormRepo = {} as any;
      const repo = new TypeOrmAlertRepository(
        ormRepo,
        dataSource,
        buildTenantContext('org-2'),
      );

      await expect(repo.upsertUnread(buildAlert())).rejects.toMatchObject({
        errorCode: ErrorCode.TENANT_MISMATCH,
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('countUnread', () => {
    it('counts unread rows scoped by organizationId and userId', async () => {
      const ormRepo = { count: jest.fn().mockResolvedValue(3) };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        { transaction: jest.fn() } as any,
        buildTenantContext(),
      );

      const count = await repo.countUnread('user-1');

      expect(count).toBe(3);
      expect(ormRepo.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          userId: 'user-1',
          readAt: IsNull(),
        },
      });
    });
  });

  describe('findPage', () => {
    it('paginates, filters unreadOnly, and returns total + unreadCount', async () => {
      const rows = [
        {
          id: 'alert-1',
          organizationId: 'org-1',
          userId: 'user-1',
          type: 'SMTP_FAILED',
          entityType: 'smtp_config',
          entityId: 'smtp-1',
          readAt: null,
          createdAt: new Date('2026-08-13T00:00:00Z'),
        },
      ];
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([rows, 1]),
      };
      const ormRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        count: jest.fn().mockResolvedValue(1),
      };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        { transaction: jest.fn() } as any,
        buildTenantContext(),
      );

      const page = await repo.findPage('user-1', 2, 10, true);

      expect(qb.where).toHaveBeenCalledWith(
        'alert.organizationId = :organizationId',
        { organizationId: 'org-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('alert.userId = :userId', {
        userId: 'user-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('alert.readAt IS NULL');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(page.total).toBe(1);
      expect(page.unreadCount).toBe(1);
      expect(page.items[0]?.id).toBe('alert-1');
    });
  });

  describe('findByIdForUser', () => {
    it('scopes by organizationId and userId', async () => {
      const ormRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'alert-1',
          organizationId: 'org-1',
          userId: 'user-1',
          type: 'SMTP_FAILED',
          entityType: 'smtp_config',
          entityId: 'smtp-1',
          readAt: null,
          createdAt: new Date('2026-08-13T00:00:00Z'),
        }),
      };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        { transaction: jest.fn() } as any,
        buildTenantContext(),
      );

      const alert = await repo.findByIdForUser('alert-1', 'user-1');

      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'alert-1', organizationId: 'org-1', userId: 'user-1' },
      });
      expect(alert?.id).toBe('alert-1');
    });

    it('returns null when no row matches', async () => {
      const ormRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        { transaction: jest.fn() } as any,
        buildTenantContext(),
      );

      expect(await repo.findByIdForUser('missing', 'user-1')).toBeNull();
    });
  });

  describe('markRead', () => {
    it('sets readAt only when currently unread, scoped by org/user', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const dataSource = {
        transaction: jest.fn((cb) => cb({ getRepository: () => ormRepo })),
      };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        dataSource as any,
        buildTenantContext(),
      );

      await repo.markRead('alert-1', 'user-1');

      expect(qb.where).toHaveBeenCalledWith('id = :id', { id: 'alert-1' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'organizationId = :organizationId AND userId = :userId',
        { organizationId: 'org-1', userId: 'user-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('"readAt" IS NULL');
    });
  });

  describe('markAllRead', () => {
    it('bulk-updates every unread row for the user in one statement', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 4 }),
      };
      const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const dataSource = {
        transaction: jest.fn((cb) => cb({ getRepository: () => ormRepo })),
      };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        dataSource as any,
        buildTenantContext(),
      );

      await repo.markAllRead('user-1');

      expect(qb.where).toHaveBeenCalledWith(
        'organizationId = :organizationId AND userId = :userId',
        { organizationId: 'org-1', userId: 'user-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('"readAt" IS NULL');
    });
  });

  describe('delete', () => {
    it('deletes one row scoped by id/org/user', async () => {
      const ormDeleteRepo = {
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const dataSource = {
        transaction: jest.fn((cb) =>
          cb({ getRepository: () => ormDeleteRepo }),
        ),
      };
      const repo = new TypeOrmAlertRepository(
        {} as any,
        dataSource as any,
        buildTenantContext(),
      );

      await repo.delete('alert-1', 'user-1');

      expect(ormDeleteRepo.delete).toHaveBeenCalledWith({
        id: 'alert-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });
    });
  });

  describe('deleteAll', () => {
    it('deletes every row for the user scoped by org', async () => {
      const ormDeleteRepo = {
        delete: jest.fn().mockResolvedValue({ affected: 4 }),
      };
      const dataSource = {
        transaction: jest.fn((cb) =>
          cb({ getRepository: () => ormDeleteRepo }),
        ),
      };
      const repo = new TypeOrmAlertRepository(
        {} as any,
        dataSource as any,
        buildTenantContext(),
      );

      await repo.deleteAll('user-1');

      expect(ormDeleteRepo.delete).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'user-1',
      });
    });
  });
});
