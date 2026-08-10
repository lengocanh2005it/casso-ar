import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { Raw } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CustomerCreditRow,
  IPaymentRepository,
} from '../application/payment-repository.port';
import { Payment } from '../domain/payment';
import { PaymentOrmEntity } from './payment.orm-entity';

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(payment: Payment): PaymentOrmEntity {
  return {
    id: payment.id,
    organizationId: payment.organizationId,
    customerId: payment.customerId,
    bankTransactionId: payment.bankTransactionId,
    totalAmount: payment.totalAmount,
    allocatedAmount: payment.allocatedAmount,
    payerName: payment.payerName,
    receivedAt: payment.receivedAt,
    createdAt: payment.createdAt,
  };
}

// The `pg` driver returns `bigint` columns as strings (to avoid silent
// precision loss above Number.MAX_SAFE_INTEGER), so bigint money columns
// must be coerced back to number before reaching the domain layer.
function fromOrm(row: PaymentOrmEntity): Payment {
  return new Payment({
    ...row,
    totalAmount: Number(row.totalAmount),
    allocatedAmount: Number(row.allocatedAmount),
  });
}

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
    return row ? fromOrm(row) : null;
  }

  async findUnallocatedByCustomerId(
    customerId: string,
  ): Promise<CustomerCreditRow[]> {
    const rows = await this.scopedFindMany(
      {
        customerId,
        totalAmount: Raw((alias) => `${alias} > "allocatedAmount"`),
      },
      { order: { receivedAt: 'ASC', id: 'ASC' } },
    );

    return rows.map((row) => {
      const payment = fromOrm(row);
      return { payment, unallocatedAmount: payment.unallocatedAmount };
    });
  }

  async save(payment: Payment, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(payment), manager);
  }
}
