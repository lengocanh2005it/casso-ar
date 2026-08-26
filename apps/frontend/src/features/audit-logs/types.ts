export interface AuditLogDisplay {
  entityLabel: string | null;
  customerNames: Record<string, string>;
  invoiceNumbers: Record<string, string>;
}

export interface AuditLogItem {
  id: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  display?: AuditLogDisplay;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
}

export interface AuditLogFilters {
  actorUserId?: string;
  entityType?: string;
  actionType?: string;
  receivableId?: string;
  from?: string;
  to?: string;
}

export interface AuditLogListQuery extends AuditLogFilters {
  page: number;
  limit: number;
}
