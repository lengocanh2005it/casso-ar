import type {
  ConnectionAuditEvent,
  ConnectionAuditEventType,
} from '../../domain/connection-audit-event';

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

export class ConnectionAuditEventResponseDto {
  id: string;
  bankConnectionId: string;
  eventType: ConnectionAuditEventType;
  actorUserId: string | null;
  maskedApiKey: string | null;
  oldMaskedApiKey: string | null;
  newMaskedApiKey: string | null;
  accountNumber: string | null;
  oldBankName: string | null;
  newBankName: string | null;
  oldAccountHolderName: string | null;
  newAccountHolderName: string | null;
  createdAt: Date;
}

export class ListConnectionAuditEventsResponseDto {
  items: ConnectionAuditEventResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toConnectionAuditEventResponse(
  event: ConnectionAuditEvent,
): ConnectionAuditEventResponseDto {
  const dto = new ConnectionAuditEventResponseDto();
  dto.id = event.id;
  dto.bankConnectionId = event.bankConnectionId;
  dto.eventType = event.eventType;
  dto.actorUserId =
    metadataString(event.metadata, 'actorUserId') ??
    metadataString(event.metadata, 'revealedByUserId');
  dto.maskedApiKey = metadataString(event.metadata, 'maskedApiKey');
  dto.oldMaskedApiKey = metadataString(event.metadata, 'oldMaskedApiKey');
  dto.newMaskedApiKey = metadataString(event.metadata, 'newMaskedApiKey');
  dto.accountNumber = metadataString(event.metadata, 'accountNumber');
  dto.oldBankName = metadataString(event.metadata, 'oldBankName');
  dto.newBankName = metadataString(event.metadata, 'newBankName');
  dto.oldAccountHolderName = metadataString(
    event.metadata,
    'oldAccountHolderName',
  );
  dto.newAccountHolderName = metadataString(
    event.metadata,
    'newAccountHolderName',
  );
  dto.createdAt = event.createdAt;
  return dto;
}
