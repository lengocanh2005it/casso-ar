import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { DataSource } from 'typeorm';
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

@Injectable()
export class MarkRequiresReauthorizationUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
  ) {}

  // Shared by every adapter caller (disconnect, sync-transactions): on a
  // Cas ID 401/403, mark the connection and rethrow so the caller's own
  // retry/queue policy still applies; any other error just rethrows.
  async handleAdapterError(
    connectionId: string,
    reason: string,
    error: unknown,
  ): Promise<never> {
    if (error instanceof CasIdUnauthorizedError) {
      await this.execute(connectionId, reason);
    }
    throw error;
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
  }
}
