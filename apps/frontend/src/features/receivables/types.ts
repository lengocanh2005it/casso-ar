import type { ReceivableStatus as SharedReceivableStatus } from '@casso-ledger/shared-types';

export type ReceivableStatus = SharedReceivableStatus;

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: string;
  allocatedByUserId: string | null;
}

export interface ReceivableTimelineItem {
  id: string;
  receivableId: string;
  customerId: string;
  activityType: string;
  description: string;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
}

export type InternalTaskStatus = 'OPEN' | 'DONE' | 'DISMISSED';

export interface InternalTask {
  id: string;
  receivableId: string;
  assignedToUserId: string;
  createdByUserId: string | null;
  taskType: 'ESCALATION' | 'MANUAL';
  title: string;
  description: string | null;
  dueDate: string | null;
  status: InternalTaskStatus;
  createdAt: string;
  resolvedAt: string | null;
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
