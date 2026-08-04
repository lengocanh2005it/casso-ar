import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IPaymentRepository } from '../application/payment-repository.port';
import { Payment } from '../domain/payment';
import { PaymentOrmEntity } from './payment.orm-entity';

@Injectable()
export class TypeOrmPaymentRepository
  extends BaseRepository<PaymentOrmEntity>
  implements IPaymentRepository
{
  constructor(
    @InjectRepository(PaymentOrmEntity)
    repo: Repository<PaymentOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Payment | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(PaymentOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Payment(row) : null;
  }

  async save(payment: Payment, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(PaymentOrmEntity)
      : this.ormRepo;
    await repo.save({ ...payment, organizationId } as PaymentOrmEntity);
  }
}
