import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
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
  ) {}

  async execute(connectionId: string, reason: string): Promise<void> {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) return;
    if (connection.status === 'ACTIVE') {
      await this.bankConnectionRepo.save(
        connection.markRequiresReauthorization(),
      );
    }
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connectionId,
        eventType:
          connection.status === 'ACTIVE'
            ? 'MARKED_REQUIRES_REAUTH'
            : 'API_CALL_FAILED_401',
        metadata: { reason },
        createdAt: new Date(),
      }),
    );
  }
}
