import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
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
  ) {}

  async execute(id: string): Promise<ReceivableWithDisputeStatus> {
    const receivable = await this.receivableRepo.findById(id);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }

    const [openDispute, allocations, invoices] = await Promise.all([
      this.disputeRepo.findOpenDispute(id),
      this.paymentAllocationRepo.findByReceivableId(id),
      this.invoiceRepo.findByIds(
        receivable.invoiceId ? [receivable.invoiceId] : [],
      ),
    ]);
    return {
      receivable,
      isDisputed: openDispute !== null,
      disputeId: openDispute?.id ?? null,
      allocations,
      invoiceNumber: receivable.invoiceId
        ? (invoices.get(receivable.invoiceId)?.invoiceNumber ?? null)
        : null,
      isOverdue: receivable.isOverdue(new Date()),
    };
  }
}
