import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import type { BankConnection } from '../domain/bank-connection';
import type { ConnectionAuditEventType } from '../domain/connection-audit-event';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';

export const BANK_CONNECTION_STATUS_CHANGED = 'bank-connection.status.changed';

export type BankConnectionStatusTransition =
  | 'REQUIRES_REAUTHORIZATION'
  | 'ERROR';

export interface BankConnectionStatusChangedEvent {
  bankConnectionId: string;
  organizationId: string;
  status: BankConnectionStatusTransition;
}

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
  // Casso Flow 401/403, mark the connection REQUIRES_REAUTHORIZATION; on any
  // other adapter failure (5xx, network timeout) mark it ERROR — in both
  // cases persist the transition + audit atomically, then rethrow so the
  // caller's own retry/queue policy still applies.
  async handleAdapterError(
    connectionId: string,
    reason: string,
    error: unknown,
  ): Promise<never> {
    if (error instanceof CassoFlowUnauthorizedError) {
      await this.execute(connectionId, reason);
    } else {
      await this.markError(connectionId, reason);
    }
    throw error;
  }

  private async markError(connectionId: string, reason: string): Promise<void> {
    await this.markStatus(connectionId, reason, 'ERROR');
  }

  // Called from disconnect/sync-transactions' Casso Flow 401/403 handling —
  // findByIdUnscoped is deliberate here, see bank-connection-repository.port.ts.
  async execute(connectionId: string, reason: string): Promise<void> {
    await this.markStatus(connectionId, reason, 'REQUIRES_REAUTHORIZATION');
  }

  private readonly transitions: Record<
    BankConnectionStatusTransition,
    {
      auditWhenActive: ConnectionAuditEventType;
      auditWhenInactive: ConnectionAuditEventType;
      apply: (connection: BankConnection) => BankConnection;
    }
  > = {
    REQUIRES_REAUTHORIZATION: {
      auditWhenActive: 'MARKED_REQUIRES_REAUTH',
      auditWhenInactive: 'API_CALL_FAILED_401',
      apply: (connection) => connection.markRequiresReauthorization(),
    },
    ERROR: {
      auditWhenActive: 'MARKED_ERROR',
      auditWhenInactive: 'API_CALL_FAILED',
      apply: (connection) => connection.markError(),
    },
  };

  private async markStatus(
    connectionId: string,
    reason: string,
    status: BankConnectionStatusTransition,
  ): Promise<void> {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) return;
    const wasActive = connection.status === 'ACTIVE';
    const transition = this.transitions[status];
    await this.dataSource.transaction(async (manager) => {
      if (wasActive) {
        await this.bankConnectionRepo.save(
          transition.apply(connection),
          manager,
        );
      }
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: connection.organizationId,
          bankConnectionId: connectionId,
          eventType: wasActive
            ? transition.auditWhenActive
            : transition.auditWhenInactive,
          metadata: { reason },
          createdAt: new Date(),
        }),
        manager,
      );
    });
    if (wasActive) {
      this.emitStatusChanged(connectionId, connection.organizationId, status);
    }
  }

  private emitStatusChanged(
    bankConnectionId: string,
    organizationId: string,
    status: BankConnectionStatusTransition,
  ): void {
    this.eventPublisher.emit(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status,
    });
  }
}
