import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  DISPUTE_REPOSITORY,
  type IDisputeRepository,
} from '../../disputes/application/dispute-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import {
  type IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from '../../payments/application/payment-allocation-repository.port';
import {
  type IPaymentRepository,
  PAYMENT_REPOSITORY,
} from '../../payments/application/payment-repository.port';
import type { Payment } from '../../payments/domain/payment';
import type { PaymentAllocation } from '../../payments/domain/payment-allocation';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

export interface ReceivableWithDisputeStatus {
  receivable: Receivable;
  isDisputed: boolean;
  disputeId: string | null;
  allocations: PaymentAllocation[];
  invoiceNumber: string | null;
  customerName: string | null;
  paymentsById: Map<string, Payment>;
  isOverdue: boolean;
}

@Injectable()
export class GetReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly paymentAllocationRepo: IPaymentAllocationRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(id: string): Promise<ReceivableWithDisputeStatus> {
    const receivable = await this.receivableRepo.findById(id);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }

    const [openDispute, allocations, invoices, customers] = await Promise.all([
      this.disputeRepo.findOpenDispute(id),
      this.paymentAllocationRepo.findByReceivableId(id),
      this.invoiceRepo.findByIds(
        receivable.invoiceId ? [receivable.invoiceId] : [],
      ),
      this.customerRepo.findByIds([receivable.customerId]),
    ]);
    const paymentsById = await this.paymentRepo.findByIds([
      ...new Set(allocations.map((allocation) => allocation.paymentId)),
    ]);

    return {
      receivable,
      isDisputed: openDispute !== null,
      disputeId: openDispute?.id ?? null,
      allocations,
      invoiceNumber: receivable.invoiceId
        ? (invoices.get(receivable.invoiceId)?.invoiceNumber ?? null)
        : null,
      customerName: customers.get(receivable.customerId)?.name ?? null,
      paymentsById,
      isOverdue: receivable.isOverdue(new Date()),
    };
  }
}
