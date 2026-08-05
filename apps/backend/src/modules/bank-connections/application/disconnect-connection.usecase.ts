import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CAS_ID_INTEGRATION_ADAPTER,
  CasIdUnauthorizedError,
  type ICasIdIntegrationAdapter,
} from './cas-id-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import type { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';

@Injectable()
export class DisconnectConnectionUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CAS_ID_INTEGRATION_ADAPTER)
    private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
  ) {}

  async execute(connectionId: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findById(connectionId);
    if (!connection) throw new Error('Bank connection not found');
    try {
      await this.adapter.invalidateToken(
        decryptToken(connection.encryptedAccessToken),
      );
    } catch (error) {
      if (error instanceof CasIdUnauthorizedError) {
        await this.markRequiresReauthorization.execute(
          connectionId,
          '401/403 from invalidateToken',
        );
      }
      throw error;
    }
    await this.bankConnectionRepo.save(connection.disconnect());
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connectionId,
        eventType: 'DISCONNECTED',
        metadata: {},
        createdAt: new Date(),
      }),
    );
  }
}
