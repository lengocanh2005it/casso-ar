import { ReceivableStatus } from '@casso-ar/shared-types';
import { In, IsNull, LessThanOrEqual, MoreThan, Not } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { Receivable } from '../domain/receivable';
import { TypeOrmReceivableRepository } from './typeorm-receivable.repository';

const PROPS = {
  id: 'rcv-1',
  organizationId: 'org-1',
  customerId: 'cus-1',
  invoiceId: null,
  originalAmount: 1_000_000,
  paidAmount: 250_000,
  dueDate: new Date('2026-08-01'),
  status: ReceivableStatus.PARTIALLY_PAID,
  salesRepresentativeId: null,
  createdAt: new Date('2026-07-01'),
  closedAt: null,
  version: 3,
};

describe('TypeOrmReceivableRepository', () => {
  it('finds open receivables overdue by at least the requested threshold', async () => {
    const ormRepo = { find: jest.fn().mockResolvedValue([]) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmReceivableRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findOverdueByThreshold('org-1', 30, null, 500),
    );

    expect(ormRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          status: In([ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID]),
          dueDate: expect.objectContaining(LessThanOrEqual(expect.any(Date))),
        }),
        order: { id: 'ASC' },
        take: 500,
      }),
    );
  });

  it('pages through overdue receivables with a keyset cursor on id', async () => {
    const ormRepo = { find: jest.fn().mockResolvedValue([]) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmReceivableRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findOverdueByThreshold('org-1', 30, 'rcv-99', 500),
    );

    expect(ormRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MoreThan('rcv-99'),
        }),
      }),
    );
  });

  it('maps a domain Receivable to a plain ORM entity preserving the version', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmReceivableRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(new Receivable(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rcv-1',
        organizationId: 'org-1',
        status: ReceivableStatus.PARTIALLY_PAID,
        version: 3,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).not.toBeInstanceOf(Receivable);
  });

  it('finds non-null invoice IDs for receivables in the current organization', async () => {
    const ormRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'rec-1', invoiceId: 'inv-1' },
        { id: 'rec-2', invoiceId: null },
      ]),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmReceivableRepository(ormRepo as any, tenantContext);

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findInvoiceIdsByReceivableIds(['rec-1', 'rec-2']),
    );

    expect(ormRepo.find).toHaveBeenCalledWith({
      where: {
        id: In(['rec-1', 'rec-2']),
        invoiceId: Not(IsNull()),
        organizationId: 'org-1',
      },
      select: { id: true, invoiceId: true },
    });
    expect(result).toEqual(new Map([['rec-1', 'inv-1']]));
  });

  describe('findOverdueCandidates', () => {
    it('queries overdue candidates with correct predicates, columns, order, and limit, mapping to domain instances', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'rcv-1',
            organizationId: 'org-1',
            customerId: 'cus-1',
            invoiceId: 'inv-1',
            originalAmount: 1_000_000,
            paidAmount: 250_000,
            dueDate: new Date('2026-08-01T00:00:00.000Z'),
            status: ReceivableStatus.PARTIALLY_PAID,
            salesRepresentativeId: 'user-1',
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            closedAt: null,
            version: 3,
          },
        ]),
      };
      const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const tenantContext = new TenantContextService();
      const repo = new TypeOrmReceivableRepository(
        ormRepo as any,
        tenantContext,
      );

      const refDate = new Date('2026-08-15T00:00:00.000Z');
      const result = await tenantContext.run(
        { userId: 'user-1', organizationId: 'org-1', role: Role.SALES_REP },
        () =>
          (repo as any).findOverdueCandidates({
            organizationId: 'org-1',
            referenceDate: refDate,
            salesRepresentativeId: 'user-1',
            customerIdIn: ['cus-1'],
            invoiceIdIn: ['inv-1'],
            limit: 20,
          }),
      );

      expect(ormRepo.createQueryBuilder).toHaveBeenCalledWith('r');
      expect(qb.select).toHaveBeenCalledWith([
        'r.id',
        'r.organizationId',
        'r.customerId',
        'r.invoiceId',
        'r.originalAmount',
        'r.paidAmount',
        'r.dueDate',
        'r.status',
        'r.salesRepresentativeId',
        'r.createdAt',
        'r.closedAt',
        'r.version',
      ]);
      expect(qb.where).toHaveBeenCalledWith(
        'r.organizationId = :organizationId',
        {
          organizationId: 'org-1',
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('r.status IN (:...statuses)', {
        statuses: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('r.dueDate < :referenceDate', {
        referenceDate: refDate,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'r.originalAmount > r.paidAmount',
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'r.salesRepresentativeId = :salesRepresentativeId',
        { salesRepresentativeId: 'user-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(r.customerId IN (:...customerIds) OR r.invoiceId IN (:...invoiceIds))',
        {
          customerIds: ['cus-1'],
          invoiceIds: ['inv-1'],
        },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('r.dueDate', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('r.id', 'ASC');
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.getMany).toHaveBeenCalled();

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Receivable);
      expect(result[0].id).toBe('rcv-1');
      expect(result[0].remainingAmount).toBe(750_000);
    });

    it('forces no-result predicate when search ID arrays are supplied but empty', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const tenantContext = new TenantContextService();
      const repo = new TypeOrmReceivableRepository(
        ormRepo as any,
        tenantContext,
      );

      const refDate = new Date('2026-08-15T00:00:00.000Z');
      await tenantContext.run(
        { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
        () =>
          (repo as any).findOverdueCandidates({
            organizationId: 'org-1',
            referenceDate: refDate,
            customerIdIn: [],
            invoiceIdIn: [],
            limit: 20,
          }),
      );

      expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
    });

    it('throws TENANT_MISMATCH when filters organizationId does not match tenant context', async () => {
      const ormRepo = { createQueryBuilder: jest.fn() };
      const tenantContext = new TenantContextService();
      const repo = new TypeOrmReceivableRepository(
        ormRepo as any,
        tenantContext,
      );

      await expect(
        tenantContext.run(
          { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
          () =>
            (repo as any).findOverdueCandidates({
              organizationId: 'org-2',
              referenceDate: new Date(),
              limit: 20,
            }),
        ),
      ).rejects.toThrow('TENANT_MISMATCH');
    });
  });
});
