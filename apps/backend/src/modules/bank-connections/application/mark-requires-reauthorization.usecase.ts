import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';

export const BANK_CONNECTION_STATUS_CHANGED = 'bank-connection.status.changed';

@Injectable()
export class MarkRequiresReauthorizationUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  // Shared by every adapter caller (disconnect, sync-transactions): on a
  // Cas ID 401/403, mark the connection REQUIRES_REAUTHORIZATION; on any
  // other adapter failure (5xx, network timeout) mark it ERROR — in both
  // cases persist the transition + audit atomically, then rethrow so the
  // caller's own retry/queue policy still applies.
  async handleAdapterError(
    connectionId: string,
    reason: string,
    error: unknown,
  ): Promise<never> {
    if (error instanceof CasIdUnauthorizedError) {
      await this.execute(connectionId, reason);
    } else {
      await this.markError(connectionId, reason);
    }
    throw error;
  }

  private async markError(connectionId: string, reason: string): Promise<void> {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) return;
    const wasActive = connection.status === 'ACTIVE';
    await this.dataSource.transaction(async (manager) => {
      if (wasActive) {
        await this.bankConnectionRepo.save(connection.markError(), manager);
      }
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: connection.organizationId,
          bankConnectionId: connectionId,
          eventType: wasActive ? 'MARKED_ERROR' : 'API_CALL_FAILED',
          metadata: { reason },
          createdAt: new Date(),
        }),
        manager,
      );
    });
    if (wasActive) {
      this.emitStatusChanged(connectionId, connection.organizationId, 'ERROR');
    }
  }

  // Called from disconnect/sync-transactions' Cas ID 401/403 handling —
  // findByIdUnscoped is deliberate here, see bank-connection-repository.port.ts.
  async execute(connectionId: string, reason: string): Promise<void> {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) return;
    const wasActive = connection.status === 'ACTIVE';
    await this.dataSource.transaction(async (manager) => {
      if (wasActive) {
        await this.bankConnectionRepo.save(
          connection.markRequiresReauthorization(),
          manager,
        );
      }
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: connection.organizationId,
          bankConnectionId: connectionId,
          eventType: wasActive
            ? 'MARKED_REQUIRES_REAUTH'
            : 'API_CALL_FAILED_401',
          metadata: { reason },
          createdAt: new Date(),
        }),
        manager,
      );
    });
    if (wasActive) {
      this.emitStatusChanged(
        connectionId,
        connection.organizationId,
        'REQUIRES_REAUTHORIZATION',
      );
    }
  }

  private emitStatusChanged(
    bankConnectionId: string,
    organizationId: string,
    status: 'REQUIRES_REAUTHORIZATION' | 'ERROR',
  ): void {
    this.eventPublisher.emit(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status,
    });
  }
}
