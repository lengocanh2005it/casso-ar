import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { TypeOrmPaymentAllocationRepository } from './typeorm-payment-allocation.repository';

describe('TypeOrmPaymentAllocationRepository.findByCustomerId', () => {
  it('joins receivables, scopes the tenant, excludes undone rows, orders newest first, and limits results', async () => {
    const row = {
      id: 'allocation-1',
      organizationId: 'org-1',
      paymentId: 'payment-1',
      receivableId: 'receivable-1',
      allocatedAmount: 1_000_000,
      allocatedAt: new Date('2026-08-03'),
      allocatedByUserId: 'user-1',
      deletedAt: null,
      deletedByUserId: null,
      undoReason: null,
      createdAt: new Date('2026-08-03'),
    };
    const query = {
      select: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([row]),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmPaymentAllocationRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findByCustomerId('customer-1', 25),
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('allocation-1');
    expect(ormRepo.createQueryBuilder).toHaveBeenCalledWith('allocation');
    expect(query.innerJoin).toHaveBeenCalledWith(
      'receivables',
      'receivable',
      'receivable.id::text = allocation."receivableId"',
    );
    expect(query.where).toHaveBeenCalledWith(
      'allocation."organizationId" = :organizationId',
      { organizationId: 'org-1' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'receivable."customerId" = :customerId',
      { customerId: 'customer-1' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'allocation."deletedAt" IS NULL',
    );
    expect(query.orderBy).toHaveBeenCalledWith(
      'allocation."allocatedAt"',
      'DESC',
    );
    expect(query.take).toHaveBeenCalledWith(25);
  });
});

describe('TypeOrmPaymentAllocationRepository.findByIdForUpdate', () => {
  it('coerces the bigint allocatedAmount column from a string to a number', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'allocation-1',
        organizationId: 'org-1',
        paymentId: 'payment-1',
        receivableId: 'receivable-1',
        allocatedAmount: '4000000', // pg driver returns bigint columns as strings
        allocatedAt: new Date('2026-08-03'),
        allocatedByUserId: 'user-1',
        deletedAt: null,
        deletedByUserId: null,
        undoReason: null,
        createdAt: new Date('2026-08-03'),
      }),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmPaymentAllocationRepository(
      {} as any,
      tenantContext,
    );

    const allocation = await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findByIdForUpdate('allocation-1', manager as any),
    );

    expect(allocation?.allocatedAmount).toBe(4_000_000);
    // A string allocatedAmount would fail this Number.isInteger check inside
    // PaymentAllocation.undo() -> Payment.withRemovedAllocation(), the exact
    // bug this regression test guards against.
    expect(Number.isInteger(allocation?.allocatedAmount)).toBe(true);
  });
});

describe('TypeOrmPaymentAllocationRepository.findByCustomerIds', () => {
  function row(id: string, customerId: string, allocatedAt: string) {
    return {
      id,
      customerId,
      organizationId: 'org-1',
      paymentId: 'payment-1',
      receivableId: `receivable-${id}`,
      allocatedAmount: '1000000', // pg returns bigint columns as strings
      allocatedAt: new Date(allocatedAt),
      allocatedByUserId: 'user-1',
      deletedAt: null,
      deletedByUserId: null,
      undoReason: null,
      createdAt: new Date('2026-08-03'),
    };
  }

  function buildRepo(rows: Array<Record<string, unknown>>) {
    const query = jest.fn().mockResolvedValue(rows);
    const manager = { query };
    const ormRepo = { manager };
    return { ormRepo, query };
  }

  it('loads every requested customer in one tenant-scoped query and keeps the newest rows per customer', async () => {
    const { ormRepo, query } = buildRepo([
      row('allocation-1', 'customer-1', '2026-08-05'),
      row('allocation-2', 'customer-1', '2026-08-04'),
      row('allocation-4', 'customer-2', '2026-08-02'),
    ]);
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmPaymentAllocationRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findByCustomerIds(['customer-1', 'customer-2'], 2),
    );

    // One round trip, with the per-customer bound applied in SQL before
    // hydration — no full history crosses the wire.
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ROW_NUMBER() OVER (');
    expect(sql).toContain('PARTITION BY r."customerId"');
    expect(sql).toContain('a."organizationId" = $1');
    expect(sql).toContain('a."deletedAt" IS NULL');
    expect(sql).toContain('r."customerId" = ANY($2)');
    expect(sql).toContain('rn <= $3');
    expect(params).toEqual(['org-1', ['customer-1', 'customer-2'], 2]);

    expect([...result.keys()]).toEqual(['customer-1', 'customer-2']);
    expect(result.get('customer-1')?.map((item) => item.id)).toEqual([
      'allocation-1',
      'allocation-2',
    ]);
    expect(result.get('customer-2')?.map((item) => item.id)).toEqual([
      'allocation-4',
    ]);
    expect(result.get('customer-1')?.[0].allocatedAmount).toBe(1_000_000);
    expect(
      Number.isInteger(result.get('customer-1')?.[0].allocatedAmount),
    ).toBe(true);
  });

  it('returns an empty map without querying when no customer ids are given', async () => {
    const { ormRepo, query } = buildRepo([]);
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmPaymentAllocationRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findByCustomerIds([], 50),
    );

    expect(result.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
