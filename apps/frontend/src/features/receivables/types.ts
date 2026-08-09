import type { ReceivableStatus as SharedReceivableStatus } from '@casso-ledger/shared-types';

export type ReceivableStatus = SharedReceivableStatus;

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: string;
  allocatedByUserId: string | null;
}

export interface Receivable {
  id: string;
  customerId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: ReceivableStatus;
  isDisputed: boolean;
  disputeId: string | null;
  isOverdue: boolean;
  salesRepresentativeId: string | null;
  createdAt: string;
  closedAt: string | null;
  allocations?: PaymentAllocation[];
}
