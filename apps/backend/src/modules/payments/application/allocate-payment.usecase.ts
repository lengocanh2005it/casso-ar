import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import {
  type IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from './payment-allocation-repository.port';
import {
  type IPaymentRepository,
  PAYMENT_REPOSITORY,
} from './payment-repository.port';

export interface AllocatePaymentInput {
  paymentId: string;
  receivableId: string;
  amount: number;
  allocatedByUserId: string | null;
}

@Injectable()
export class AllocatePaymentUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: AllocatePaymentInput): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.allocateWithinTransaction(manager, input).then(() => undefined),
    );
  }

  async allocateWithinTransaction(
    manager: EntityManager,
    input: AllocatePaymentInput,
  ): Promise<void> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }

    const receivable = await this.receivableRepo.findByIdForUpdate(
      input.receivableId,
      manager,
    );
    if (!receivable) {
      throw new Error('Receivable not found');
    }

    const payment = await this.paymentRepo.findByIdForUpdate(
      input.paymentId,
      manager,
    );
    if (!payment) {
      throw new Error('Payment not found');
    }

    if (!payment.customerId) {
      throw new Error(
        'Payment customer is unresolved; send to Exception Queue first',
      );
    }
    if (payment.customerId !== receivable.customerId) {
      throw new Error('Payment and receivable belong to different customers');
    }

    const updatedReceivable = receivable.applyPaymentAllocation(input.amount);
    const updatedPayment = payment.withAdditionalAllocation(input.amount);

    await this.receivableRepo.save(updatedReceivable, manager);
    await this.paymentRepo.save(updatedPayment, manager);
    await this.allocationRepo.save(
      new PaymentAllocation({
        id: randomUUID(),
        organizationId: this.tenantContext.getOrganizationId(),
        paymentId: input.paymentId,
        receivableId: input.receivableId,
        allocatedAmount: input.amount,
        allocatedAt: new Date(),
        allocatedByUserId: input.allocatedByUserId,
        deletedAt: null,
        deletedByUserId: null,
        undoReason: null,
        createdAt: new Date(),
      }),
      manager,
    );
  }
}
