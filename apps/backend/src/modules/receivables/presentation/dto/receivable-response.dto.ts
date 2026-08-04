import type { ReceivableStatus } from '@casso-ledger/shared-types';

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

  static fromEntity(entity: {
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
  }): ReceivableResponseDto {
    const dto = new ReceivableResponseDto();
    dto.id = entity.id;
    dto.customerId = entity.customerId;
    dto.invoiceId = entity.invoiceId;
    dto.originalAmount = entity.originalAmount;
    dto.paidAmount = entity.paidAmount;
    dto.remainingAmount = entity.originalAmount - entity.paidAmount;
    dto.dueDate = entity.dueDate;
    dto.status = entity.status;
    dto.salesRepresentativeId = entity.salesRepresentativeId;
    dto.createdAt = entity.createdAt;
    dto.closedAt = entity.closedAt;
    return dto;
  }
}
