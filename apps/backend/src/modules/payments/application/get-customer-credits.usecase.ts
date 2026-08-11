import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  type IPaymentRepository,
  PAYMENT_REPOSITORY,
} from './payment-repository.port';

export interface GetCustomerCreditsInput {
  customerId: string;
}

export interface CustomerCreditsResult {
  customerId: string;
  totalAvailableAmount: number;
  items: Array<{
    paymentId: string;
    bankTransactionId: string | null;
    totalAmount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    payerName: string;
    receivedAt: Date;
    createdAt: Date;
  }>;
}

@Injectable()
export class GetCustomerCreditsUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(
    input: GetCustomerCreditsInput,
  ): Promise<CustomerCreditsResult> {
    const customer = await this.customerRepo.findById(input.customerId);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
    }

    const rows = await this.paymentRepo.findUnallocatedByCustomerId(
      input.customerId,
    );
    const items = rows.map(({ payment, unallocatedAmount }) => ({
      paymentId: payment.id,
      bankTransactionId: payment.bankTransactionId,
      totalAmount: payment.totalAmount,
      allocatedAmount: payment.allocatedAmount,
      unallocatedAmount,
      payerName: payment.payerName,
      receivedAt: payment.receivedAt,
      createdAt: payment.createdAt,
    }));

    return {
      customerId: input.customerId,
      totalAvailableAmount: rows.reduce(
        (total, row) => total + row.unallocatedAmount,
        0,
      ),
      items,
    };
  }
}
