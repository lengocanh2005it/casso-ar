import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IPaymentAllocationRepository } from '../application/payment-allocation-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import { PaymentAllocationOrmEntity } from './payment-allocation.orm-entity';

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
    return row ? new PaymentAllocation(row) : null;
  }

  async save(
    allocation: PaymentAllocation,
    manager: EntityManager,
  ): Promise<void> {
    if (allocation.organizationId !== this.tenantContext.getOrganizationId()) {
      throw new Error('TENANT_MISMATCH');
    }
    await manager.getRepository(PaymentAllocationOrmEntity).save(allocation);
  }

  async findByReceivableId(receivableId: string): Promise<PaymentAllocation[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { receivableId, organizationId, deletedAt: IsNull() },
      order: { allocatedAt: 'ASC' },
    });
    return rows.map((row) => new PaymentAllocation(row));
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
        'receivable.id = allocation."receivableId"',
      )
      .where('allocation."organizationId" = :organizationId', {
        organizationId,
      })
      .andWhere('receivable."customerId" = :customerId', { customerId })
      .andWhere('allocation."deletedAt" IS NULL')
      .orderBy('allocation."allocatedAt"', 'DESC')
      .take(limit)
      .getMany();
    return rows.map((row) => new PaymentAllocation(row));
  }
}
