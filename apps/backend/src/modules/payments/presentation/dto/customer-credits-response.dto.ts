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
