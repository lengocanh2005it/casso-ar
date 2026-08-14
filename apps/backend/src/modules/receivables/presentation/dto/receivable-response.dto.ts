import type { ReceivableStatus } from '@casso-ledger/shared-types';

export class PaymentAllocationResponseDto {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
}

export class ReceivableResponseDto {
  id: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  salesRepresentativeId: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export class ReceivableDetailResponseDto extends ReceivableResponseDto {
  invoiceNumber: string | null;
  isOverdue: boolean;
  isDisputed: boolean;
  disputeId: string | null;
  allocations: PaymentAllocationResponseDto[];
}

interface AllocationSource {
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
}

interface ReceivableResponseSource {
  id: string;
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  paidAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  salesRepresentativeId: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export function toReceivableResponse(
  r: ReceivableResponseSource,
): ReceivableResponseDto {
  return {
    id: r.id,
    customerId: r.customerId,
    invoiceId: r.invoiceId,
    originalAmount: r.originalAmount,
    paidAmount: r.paidAmount,
    remainingAmount: r.originalAmount - r.paidAmount,
    dueDate: r.dueDate,
    status: r.status,
    salesRepresentativeId: r.salesRepresentativeId,
    createdAt: r.createdAt,
    closedAt: r.closedAt,
  };
}

export function toReceivableDetailResponse(
  r: ReceivableResponseSource,
  isDisputed: boolean,
  disputeId: string | null,
  allocations: AllocationSource[],
  invoiceNumber: string | null,
  isOverdue: boolean,
): ReceivableDetailResponseDto {
  return {
    ...toReceivableResponse(r),
    invoiceNumber,
    isOverdue,
    isDisputed,
    disputeId,
    allocations: allocations.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      allocatedAmount: a.allocatedAmount,
      allocatedAt: a.allocatedAt,
      allocatedByUserId: a.allocatedByUserId,
    })),
  };
}
