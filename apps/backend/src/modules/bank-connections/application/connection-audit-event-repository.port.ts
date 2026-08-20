import type { EntityManager } from 'typeorm';
import type {
  ConnectionAuditEvent,
  ConnectionAuditEventType,
} from '../domain/connection-audit-event';

export interface IConnectionAuditEventRepository {
  save(event: ConnectionAuditEvent, manager?: EntityManager): Promise<void>;
  findByBankConnectionIds(
    bankConnectionIds: string[],
    eventTypes: ConnectionAuditEventType[],
    page: number,
    limit: number,
  ): Promise<{ items: ConnectionAuditEvent[]; total: number }>;
}

export const CONNECTION_AUDIT_EVENT_REPOSITORY = Symbol(
  'CONNECTION_AUDIT_EVENT_REPOSITORY',
);
