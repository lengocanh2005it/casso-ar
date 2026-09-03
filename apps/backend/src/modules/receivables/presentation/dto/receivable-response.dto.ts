import type { ReceivableStatus } from '@casso-ar/shared-types';

export class PaymentAllocationResponseDto {
  id: string;
  paymentId: string;
  payerName: string | null;
  bankTransactionId: string | null;
  receivedAt: Date | null;
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
  customerName: string | null;
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

interface PaymentMetadataSource {
  payerName: string;
  bankTransactionId: string | null;
  receivedAt: Date;
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
  customerName: string | null,
  paymentsById: ReadonlyMap<string, PaymentMetadataSource>,
  isOverdue: boolean,
): ReceivableDetailResponseDto {
  return {
    ...toReceivableResponse(r),
    invoiceNumber,
    customerName,
    isOverdue,
    isDisputed,
    disputeId,
    allocations: allocations.map((a) => {
      const payment = paymentsById.get(a.paymentId);
      return {
        id: a.id,
        paymentId: a.paymentId,
        payerName: payment?.payerName ?? null,
        bankTransactionId: payment?.bankTransactionId ?? null,
        receivedAt: payment?.receivedAt ?? null,
        allocatedAmount: a.allocatedAmount,
        allocatedAt: a.allocatedAt,
        allocatedByUserId: a.allocatedByUserId,
      };
    }),
  };
}
