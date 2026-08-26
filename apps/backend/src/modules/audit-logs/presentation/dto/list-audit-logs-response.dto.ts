export class AuditLogDisplayResponseDto {
  entityLabel: string | null;
  customerNames: Record<string, string>;
  invoiceNumbers: Record<string, string>;
}

export class AuditLogItemResponse {
  id: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  display: AuditLogDisplayResponseDto;
}

export class ListAuditLogsResponseDto {
  items: AuditLogItemResponse[];
  total: number;
}
