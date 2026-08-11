import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { Payment } from '../domain/payment';
import { TypeOrmPaymentRepository } from './typeorm-payment.repository';

const PROPS = {
  id: 'pay-1',
  organizationId: 'org-1',
  customerId: 'cus-1',
  bankTransactionId: 'btx-1',
  totalAmount: 1_000_000,
  allocatedAmount: 250_000,
  payerName: 'Acme Co',
  receivedAt: new Date('2026-08-01'),
  createdAt: new Date('2026-08-01'),
};

describe('TypeOrmPaymentRepository', () => {
  it('normalizes PostgreSQL bigint strings before constructing a domain Payment', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        ...PROPS,
        totalAmount: '80000000',
        allocatedAmount: '50000000',
      }),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmPaymentRepository(ormRepo as any, tenantContext);

    const payment = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByIdForUpdate('pay-1', manager as any),
    );

    expect(payment).toEqual(
      expect.objectContaining({
        totalAmount: 80_000_000,
        allocatedAmount: 50_000_000,
      }),
    );
    expect(payment?.unallocatedAmount).toBe(30_000_000);
    expect(payment?.withAdditionalAllocation(30_000_000).allocatedAmount).toBe(
      80_000_000,
    );
  });

  it('maps a domain Payment to a plain ORM entity', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmPaymentRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(new Payment(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pay-1',
        organizationId: 'org-1',
        allocatedAmount: 250_000,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).not.toBeInstanceOf(Payment);
  });

  it('returns only the current tenant customer payments with a positive unallocated rollup', async () => {
    const ormRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'pay-1',
          organizationId: 'org-1',
          customerId: 'cus-1',
          bankTransactionId: null,
          totalAmount: 25_000_000,
          allocatedAmount: 20_000_000,
          payerName: 'Công ty B',
          receivedAt: new Date('2026-08-01'),
          createdAt: new Date('2026-08-01'),
        },
      ]),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmPaymentRepository(ormRepo as any, tenantContext);

    const rows = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findUnallocatedByCustomerId('cus-1'),
    );

    expect(ormRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          customerId: 'cus-1',
        }),
        order: { receivedAt: 'ASC', id: 'ASC' },
      }),
    );
    expect(rows[0].unallocatedAmount).toBe(5_000_000);
  });

  it('requests receivedAt ASC, id ASC ordering and maps multiple rows in the order returned', async () => {
    const ormRepo = {
      find: jest.fn().mockResolvedValue([
        { ...PROPS, id: 'pay-1', receivedAt: new Date('2026-08-01') },
        { ...PROPS, id: 'pay-2', receivedAt: new Date('2026-08-02') },
        { ...PROPS, id: 'pay-3', receivedAt: new Date('2026-08-03') },
      ]),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmPaymentRepository(ormRepo as any, tenantContext);

    const rows = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findUnallocatedByCustomerId('cus-1'),
    );

    // The DB, not this mock, is what actually enforces the sort — this only
    // proves the query requests it and the mapping doesn't reorder rows.
    // Real multi-row ordering is verified end-to-end against Postgres in
    // credit-balance-management.e2e-spec.ts.
    expect(ormRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { receivedAt: 'ASC', id: 'ASC' } }),
    );
    expect(rows.map((row) => row.payment.id)).toEqual([
      'pay-1',
      'pay-2',
      'pay-3',
    ]);
  });
});
