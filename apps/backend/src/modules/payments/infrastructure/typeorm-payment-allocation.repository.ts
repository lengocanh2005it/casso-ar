import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IPaymentAllocationRepository } from '../application/payment-allocation-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import { PaymentAllocationOrmEntity } from './payment-allocation.orm-entity';

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(allocation: PaymentAllocation): PaymentAllocationOrmEntity {
  return {
    id: allocation.id,
    organizationId: allocation.organizationId,
    paymentId: allocation.paymentId,
    receivableId: allocation.receivableId,
    allocatedAmount: allocation.allocatedAmount,
    allocatedAt: allocation.allocatedAt,
    allocatedByUserId: allocation.allocatedByUserId,
    deletedAt: allocation.deletedAt,
    deletedByUserId: allocation.deletedByUserId,
    undoReason: allocation.undoReason,
    createdAt: allocation.createdAt,
  };
}

// The `pg` driver returns `bigint` columns as strings (to avoid silent
// precision loss above Number.MAX_SAFE_INTEGER), so `allocatedAmount` must
// be coerced back to number before reaching the domain layer — otherwise
// PaymentAllocation.undo()'s downstream Payment.withRemovedAllocation()/
// Receivable.removePaymentAllocation() calls reject it as a non-integer.
function fromOrm(row: PaymentAllocationOrmEntity): PaymentAllocation {
  return new PaymentAllocation({
    ...row,
    allocatedAmount: Number(row.allocatedAmount),
  });
}

@Injectable()
export class TypeOrmPaymentAllocationRepository
  implements IPaymentAllocationRepository
{
  constructor(
    @InjectRepository(PaymentAllocationOrmEntity)
    private readonly ormRepo: Repository<PaymentAllocationOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<PaymentAllocation | null> {
    const row = await manager.findOne(PaymentAllocationOrmEntity, {
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? fromOrm(row) : null;
  }

  async save(
    allocation: PaymentAllocation,
    manager: EntityManager,
  ): Promise<void> {
    if (allocation.organizationId !== this.tenantContext.getOrganizationId()) {
      throw new Error('TENANT_MISMATCH');
    }
    await manager
      .getRepository(PaymentAllocationOrmEntity)
      .save(toOrm(allocation));
  }

  async findByReceivableId(receivableId: string): Promise<PaymentAllocation[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { receivableId, organizationId, deletedAt: IsNull() },
      order: { allocatedAt: 'ASC' },
    });
    return rows.map(fromOrm);
  }

  async findByCustomerId(
    customerId: string,
    limit: number,
  ): Promise<PaymentAllocation[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo
      .createQueryBuilder('allocation')
      .select([
        'allocation.id',
        'allocation.organizationId',
        'allocation.paymentId',
        'allocation.receivableId',
        'allocation.allocatedAmount',
        'allocation.allocatedAt',
        'allocation.allocatedByUserId',
        'allocation.deletedAt',
        'allocation.deletedByUserId',
        'allocation.undoReason',
        'allocation.createdAt',
      ])
      .innerJoin(
        'receivables',
        'receivable',
        // receivables.id is uuid while payment_allocations.receivableId is
        // varchar, so Postgres rejects `uuid = varchar` at plan time. Cast the
        // uuid side, matching the joins in
        // typeorm-receivable-balance-history-query.ts.
        'receivable.id::text = allocation."receivableId"',
      )
      .where('allocation."organizationId" = :organizationId', {
        organizationId,
      })
      .andWhere('receivable."customerId" = :customerId', { customerId })
      .andWhere('allocation."deletedAt" IS NULL')
      .orderBy('allocation."allocatedAt"', 'DESC')
      .take(limit)
      .getMany();
    return rows.map(fromOrm);
  }
}
