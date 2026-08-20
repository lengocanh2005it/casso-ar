import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

@Injectable()
export class DisconnectConnectionUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly auditContext: AuditContextService,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  async execute(connectionId: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findById(connectionId);
    this.assertFound(connection);

    let cassoFlowAuthorizationId = connection.cassoFlowAuthorizationId;
    let shouldInvalidateToken = false;

    await this.dataSource.transaction(async (manager) => {
      // Re-fetch under a row lock: the connection may have changed between
      // the unlocked read above and this transaction (e.g. a concurrent
      // disconnect or a sync job marking it REQUIRES_REAUTHORIZATION).
      const locked = await this.bankConnectionRepo.findByIdForUpdate(
        connectionId,
        manager,
      );
      this.assertFound(locked);
      this.auditContext.setBefore(locked);
      cassoFlowAuthorizationId = locked.cassoFlowAuthorizationId;
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
      const remainingActive =
        await this.bankConnectionRepo.countActiveByAuthorization(
          cassoFlowAuthorizationId,
          manager,
        );
      shouldInvalidateToken = remainingActive === 0;
    });

    if (!shouldInvalidateToken) return;

    const authorization = await this.authorizationRepo.findByIdUnscoped(
      cassoFlowAuthorizationId,
    );
    if (!authorization) return; // defensive — should not happen, the FK guarantees it exists

    // External call stays outside the transaction, same as elsewhere in this module.
    try {
      await this.adapter.invalidateToken(
        decryptToken(authorization.encryptedApiKey, this.encryptionKey),
      );
    } catch (error) {
      await this.markRequiresReauthorization.handleAdapterError(
        connectionId,
        '401/403 from invalidateToken',
        error,
      );
    }
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
