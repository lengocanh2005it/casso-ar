import type { ReceivableStatus } from '@casso-ledger/shared-types';

export interface ReceivableAllocationDto {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
}

export interface ReceivableSummaryResponseDto {
  id: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  isOverdue: boolean;
  isDisputed: boolean;
  disputeId: string | null;
  salesRepresentativeId: string | null;
  createdAt: Date;
}

export interface ReceivableDetailResponseDto
  extends ReceivableSummaryResponseDto {
  allocations: ReceivableAllocationDto[];
}

interface ReceivableSource {
  id: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  salesRepresentativeId: string | null;
  createdAt: Date;
}

interface AllocationSource {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
}

export function toReceivableSummaryResponse(
  r: ReceivableSource,
  isOverdue: boolean,
  isDisputed: boolean,
  disputeId: string | null,
): ReceivableSummaryResponseDto {
  return {
    id: r.id,
    customerId: r.customerId,
    invoiceId: r.invoiceId,
    originalAmount: r.originalAmount,
    paidAmount: r.paidAmount,
    remainingAmount: r.originalAmount - r.paidAmount,
    dueDate: r.dueDate,
    status: r.status,
    isOverdue,
    isDisputed,
    disputeId,
    salesRepresentativeId: r.salesRepresentativeId,
    createdAt: r.createdAt,
  };
}

export function toReceivableDetailResponse(
  r: ReceivableSource,
  isOverdue: boolean,
  isDisputed: boolean,
  disputeId: string | null,
  allocations: AllocationSource[],
): ReceivableDetailResponseDto {
  return {
    ...toReceivableSummaryResponse(r, isOverdue, isDisputed, disputeId),
    allocations: allocations.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      allocatedAmount: a.allocatedAmount,
      allocatedAt: a.allocatedAt,
      allocatedByUserId: a.allocatedByUserId,
    })),
  };
}
