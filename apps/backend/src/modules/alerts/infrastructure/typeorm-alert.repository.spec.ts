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
});
