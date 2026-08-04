import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IPaymentRepository } from '../application/payment-repository.port';
import { Payment } from '../domain/payment';
import { PaymentOrmEntity } from './payment.orm-entity';

@Injectable()
export class TypeOrmPaymentRepository implements IPaymentRepository {
  constructor(
    @InjectRepository(PaymentOrmEntity)
    private readonly repo: Repository<PaymentOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Payment | null> {
    const row = await manager.findOne(PaymentOrmEntity, {
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Payment(row) : null;
  }

  async save(payment: Payment, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(PaymentOrmEntity) : this.repo;
    await repo.save({
      ...payment,
      organizationId: this.tenantContext.getOrganizationId(),
    } as PaymentOrmEntity);
  }
}
