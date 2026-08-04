import type { AuditActionType, AuditEntityType } from './audit.enums';

export interface AuditLogProps {
  organizationId: string;
  userId: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

export class AuditLog implements AuditLogProps {
  readonly organizationId: string;
  readonly userId: string;
  readonly actionType: AuditActionType;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly beforeState: Record<string, unknown>;
  readonly afterState: Record<string, unknown>;
  readonly ipAddress: string | null;
  readonly createdAt: Date;

  constructor(props: AuditLogProps) {
    Object.assign(this, props);
  }
}
