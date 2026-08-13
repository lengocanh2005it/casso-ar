import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { CollectionActivityType } from '../common/collection-activity-types';
import { CollectionActivity } from '../domain/collection-activity';
import { TypeOrmCollectionActivityRepository } from './typeorm-collection-activity.repository';

function buildActivity(
  id: string,
  createdAt: Date,
  organizationId = 'org-1',
): CollectionActivity {
  return new CollectionActivity({
    id,
    organizationId,
    receivableId: 'rec-1',
    customerId: 'cust-1',
    activityType: CollectionActivityType.PAYMENT_RECEIVED,
    description: 'x',
    metadata: {},
    createdByUserId: null,
    createdAt,
  });
}

describe('TypeOrmCollectionActivityRepository', () => {
  it('findByOrganizationId scopes by the current tenant, orders newest first, and paginates', async () => {
    const rows = [
      { ...buildActivity('act-2', new Date('2026-08-02')) },
      { ...buildActivity('act-1', new Date('2026-08-01')) },
    ];
    const ormRepo = {
      findAndCount: jest.fn().mockResolvedValue([rows, 2]),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCollectionActivityRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByOrganizationId(1, 20),
    );

    expect(ormRepo.findAndCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.id)).toEqual(['act-2', 'act-1']);
  });

  it('computes skip from page and limit', async () => {
    const ormRepo = { findAndCount: jest.fn().mockResolvedValue([[], 0]) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCollectionActivityRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByOrganizationId(3, 10),
    );

    expect(ormRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

describe('TypeOrmCollectionActivityRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 15 });
    const repo = new TypeOrmCollectionActivityRepository(
      { delete: deleteMock } as any,
      { getOrganizationId: jest.fn() } as any,
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(15);
  });
});
