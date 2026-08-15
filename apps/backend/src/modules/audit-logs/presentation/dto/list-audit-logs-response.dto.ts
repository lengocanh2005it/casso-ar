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
}

export class ListAuditLogsResponseDto {
  items: AuditLogItemResponse[];
  total: number;
}
