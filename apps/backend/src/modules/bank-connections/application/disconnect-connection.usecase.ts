import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CAS_ID_INTEGRATION_ADAPTER,
  type ICasIdIntegrationAdapter,
} from './cas-id-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
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
    private readonly dataSource: DataSource,
  ) {}

  async execute(connectionId: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findById(connectionId);
    this.assertFound(connection);
    // External call stays outside the transaction — only the DB writes below are wrapped.
    try {
      await this.adapter.invalidateToken(
        decryptToken(connection.encryptedAccessToken),
      );
    } catch (error) {
      await this.markRequiresReauthorization.handleAdapterError(
        connectionId,
        '401/403 from invalidateToken',
        error,
      );
    }
    await this.dataSource.transaction(async (manager) => {
      // Re-fetch under a row lock: the connection may have changed between
      // the unlocked read above and this transaction (e.g. a concurrent
      // disconnect or a sync job marking it REQUIRES_REAUTHORIZATION).
      const locked = await this.bankConnectionRepo.findByIdForUpdate(
        connectionId,
        manager,
      );
      this.assertFound(locked);
      await this.bankConnectionRepo.save(locked.disconnect(), manager);
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: locked.organizationId,
          bankConnectionId: connectionId,
          eventType: 'DISCONNECTED',
          metadata: {},
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }

  private assertFound(
    connection: BankConnection | null,
  ): asserts connection is BankConnection {
    if (!connection) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy kết nối ngân hàng.',
      );
    }
  }
}
