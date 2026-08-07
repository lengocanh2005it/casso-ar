import { SetMetadata } from '@nestjs/common';
import type { AuditActionType, AuditEntityType } from './audit.enums';

export const AUDITED_METADATA_KEY = 'auditedMetadata';

export interface AuditedMetadata {
  actionType: AuditActionType;
  entityType: AuditEntityType;
}

export const Audited = (
  actionType: AuditActionType,
  entityType: AuditEntityType,
) => SetMetadata(AUDITED_METADATA_KEY, { actionType, entityType });
