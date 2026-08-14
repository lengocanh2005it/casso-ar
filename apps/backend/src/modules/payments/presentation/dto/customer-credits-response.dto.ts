import type { CustomerCreditsResult } from '../../application/get-customer-credits.usecase';

export class CustomerCreditItemResponse {
  paymentId: string;
  bankTransactionId: string | null;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  payerName: string;
  receivedAt: Date;
  createdAt: Date;
}

export class CustomerCreditsResponseDto {
  customerId: string;
  totalAvailableAmount: number;
  items: CustomerCreditItemResponse[];
}

export function toCustomerCreditsResponse(
  result: CustomerCreditsResult,
): CustomerCreditsResponseDto {
  return {
    customerId: result.customerId,
    totalAvailableAmount: result.totalAvailableAmount,
    items: result.items.map((item) => ({ ...item })),
  };
}
