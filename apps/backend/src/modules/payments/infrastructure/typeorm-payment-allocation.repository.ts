import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IPaymentAllocationRepository } from '../application/payment-allocation-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import { PaymentAllocationOrmEntity } from './payment-allocation.orm-entity';

@Injectable()
export class TypeOrmPaymentAllocationRepository
  implements IPaymentAllocationRepository
{
  constructor(private readonly tenantContext: TenantContextService) {}

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
}
