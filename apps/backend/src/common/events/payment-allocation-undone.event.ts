export interface PaymentAllocationUndoneEvent extends Record<string, unknown> {
  allocationId: string;
  paymentId: string;
  receivableId: string;
  customerId: string;
  organizationId: string;
  amount: number;
  undoneByUserId: string;
  undoReason: string;
}
