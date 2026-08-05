import type { EntityManager } from 'typeorm';
import type { ConnectionAuditEvent } from '../domain/connection-audit-event';

export interface IConnectionAuditEventRepository {
  save(event: ConnectionAuditEvent, manager?: EntityManager): Promise<void>;
}

export const CONNECTION_AUDIT_EVENT_REPOSITORY = Symbol(
  'CONNECTION_AUDIT_EVENT_REPOSITORY',
);
