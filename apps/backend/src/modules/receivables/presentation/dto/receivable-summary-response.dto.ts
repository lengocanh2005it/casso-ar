import type { ReceivableStatus } from '@casso-ledger/shared-types';

export interface ReceivableSummaryResponseDto {
  id: string;
  customerId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
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

export function toReceivableSummaryResponse(
  r: ReceivableSource,
  isOverdue: boolean,
  isDisputed: boolean,
  disputeId: string | null,
  invoiceNumber: string | null,
): ReceivableSummaryResponseDto {
  return {
    id: r.id,
    customerId: r.customerId,
    invoiceId: r.invoiceId,
    invoiceNumber,
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
