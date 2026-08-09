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
      'receivable.id = allocation."receivableId"',
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
