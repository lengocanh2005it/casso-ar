import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface ConnectCassoFlowInput {
  organizationId: string;
  apiKey: string;
  bankConnectionId?: string;
}

@Injectable()
export class ConnectCassoFlowUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async execute(input: ConnectCassoFlowInput): Promise<BankConnection> {
    // External calls stay outside the transaction — only the DB writes below are wrapped.
    const accountInfo = await this.adapter.getAccountInfo(input.apiKey);
    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(input.apiKey, secureToken);

    return this.dataSource.transaction(async (manager) => {
      await this.planLimitService.enforceBankConnectionLimit(manager, () =>
        this.bankConnectionRepo.countActiveByOrganization(
          input.organizationId,
          manager,
        ),
      );

      const existing =
        await this.bankConnectionRepo.findActiveOrReauthorizableByOrganizationForUpdate(
          input.organizationId,
          manager,
        );
      // A caller reconnecting a specific row (the reconnect UI) must target
      // the same connection it saw — guards against a stale bankConnectionId
      // silently reactivating a different connection than the one shown.
      if (input.bankConnectionId && existing?.id !== input.bankConnectionId) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy kết nối ngân hàng cần kết nối lại.',
        );
      }
      const props = {
        accountNumber: accountInfo.accountNumber,
        bankName: accountInfo.bankName,
        encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
        encryptedCassoApiKey: encryptToken(input.apiKey, this.encryptionKey),
      };
      const connection =
        existing && existing.status !== 'ACTIVE'
          ? existing.reactivate(props)
          : new BankConnection({
              id: randomUUID(),
              organizationId: input.organizationId,
              ...props,
              status: 'ACTIVE',
              connectedAt: new Date(),
              lastSyncAt: null,
              revokedAt: null,
              createdAt: new Date(),
            });

      await this.bankConnectionRepo.save(connection, manager);
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: connection.organizationId,
          bankConnectionId: connection.id,
          eventType: existing ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
          metadata: { accountNumber: accountInfo.accountNumber },
          createdAt: new Date(),
        }),
        manager,
      );
      return connection;
    });
  }
}
