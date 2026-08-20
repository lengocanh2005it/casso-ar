import { BankConnection } from '../../domain/bank-connection';

export class BankConnectionResponseDto {
  id: string;
  cassoFlowAuthorizationId: string;
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: string;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

export class ListBankConnectionsResponseDto {
  items: BankConnectionResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toBankConnectionResponse(
  connection: BankConnection,
): BankConnectionResponseDto {
  const dto = new BankConnectionResponseDto();
  dto.id = connection.id;
  dto.cassoFlowAuthorizationId = connection.cassoFlowAuthorizationId;
  dto.accountNumber = connection.accountNumber;
  dto.bankName = connection.bankName;
  dto.accountHolderName = connection.accountHolderName;
  dto.status = connection.status;
  dto.connectedAt = connection.connectedAt;
  dto.lastSyncAt = connection.lastSyncAt;
  dto.createdAt = connection.createdAt;
  return dto;
}
