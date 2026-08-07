import type { ReceivableStatus } from '@casso-ledger/shared-types';

export interface ReceivableResponseDto {
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

export interface ReceivableDetailResponseDto extends ReceivableResponseDto {
  isDisputed: boolean;
  disputeId: string | null;
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
    ...r,
    remainingAmount: r.originalAmount - r.paidAmount,
  };
}

export function toReceivableDetailResponse(
  r: ReceivableResponseSource,
  isDisputed: boolean,
  disputeId: string | null,
): ReceivableDetailResponseDto {
  return { ...toReceivableResponse(r), isDisputed, disputeId };
}
