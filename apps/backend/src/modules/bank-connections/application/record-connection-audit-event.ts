import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  ConnectionAuditEvent,
  type ConnectionAuditEventType,
} from '../domain/connection-audit-event';
import type { IConnectionAuditEventRepository } from './connection-audit-event-repository.port';

// Shared by RevealCassoFlowApiKeyUseCase and RotateCassoFlowAuthorizationUseCase
// — both fan out one ConnectionAuditEvent per BankConnection under a
// CassoFlowAuthorization. Only the event construction is shared; each use
// case still owns its own loop, since what triggers the write (and what else
// happens per connection) differs between them.
export function recordConnectionAuditEvent(
  auditEventRepo: IConnectionAuditEventRepository,
  event: {
    organizationId: string;
    bankConnectionId: string;
    eventType: ConnectionAuditEventType;
    metadata: Record<string, unknown>;
  },
  manager?: EntityManager,
): Promise<void> {
  return auditEventRepo.save(
    new ConnectionAuditEvent({
      id: randomUUID(),
      organizationId: event.organizationId,
      bankConnectionId: event.bankConnectionId,
      eventType: event.eventType,
      metadata: event.metadata,
      createdAt: new Date(),
    }),
    manager,
  );
}
