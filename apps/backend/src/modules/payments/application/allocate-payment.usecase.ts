import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
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
    private readonly auditContext: AuditContextService,
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
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Số tiền phân bổ phải là số nguyên dương.',
      );
    }

    const receivable = await this.receivableRepo.findByIdForUpdate(
      input.receivableId,
      manager,
    );
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }

    const payment = await this.paymentRepo.findByIdForUpdate(
      input.paymentId,
      manager,
    );
    if (!payment) {
      throw new AppError(
        ErrorCode.PAYMENT_NOT_FOUND,
        'Không tìm thấy khoản thanh toán.',
      );
    }

    if (!payment.customerId) {
      throw new AppError(
        ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED,
        'Khoản thanh toán chưa xác định được khách hàng.',
      );
    }
    if (payment.customerId !== receivable.customerId) {
      throw new AppError(
        ErrorCode.CUSTOMER_MISMATCH,
        'Khoản thanh toán và khoản phải thu thuộc các khách hàng khác nhau.',
      );
    }

    this.auditContext.setBefore({ payment, receivable });

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
    this.auditContext.setAfter({
      payment: updatedPayment,
      receivable: updatedReceivable,
    });
  }
}
