import { randomUUID } from 'node:crypto';
import type { AuditActionType, AuditEntityType } from './audit.enums';

export interface AuditLogProps {
  id?: string;
  organizationId: string;
  userId: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  relatedReceivableId?: string | null;
}

export class AuditLog implements AuditLogProps {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly actionType: AuditActionType;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly beforeState: Record<string, unknown> | null;
  readonly afterState: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly relatedReceivableId: string | null;

  constructor(props: AuditLogProps) {
    this.id = props.id ?? randomUUID();
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.actionType = props.actionType;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.beforeState = props.beforeState;
    this.afterState = props.afterState;
    this.ipAddress = props.ipAddress;
    this.createdAt = props.createdAt;
    this.relatedReceivableId = props.relatedReceivableId ?? null;
  }
}
