import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { assertReauthorizable } from './assert-reauthorizable';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CAS_ID_CONNECTION_SESSION_REPOSITORY,
  type ICasIdConnectionSessionRepository,
} from './cas-id-connection-session-repository.port';
import {
  CAS_ID_INTEGRATION_ADAPTER,
  type ICasIdIntegrationAdapter,
} from './cas-id-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface ExchangeTokenInput {
  sessionId: string;
  publicToken: string;
}

@Injectable()
export class ExchangeTokenUseCase {
  constructor(
    @Inject(CAS_ID_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepo: ICasIdConnectionSessionRepository,
    @Inject(CAS_ID_INTEGRATION_ADAPTER)
    private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async execute(input: ExchangeTokenInput): Promise<BankConnection> {
    const session = await this.sessionRepo.findById(input.sessionId);
    if (!session)
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiên kết nối.');
    if (
      session.status === 'PENDING_AUTHORIZATION' &&
      session.isExpired(new Date())
    ) {
      await this.dataSource.transaction((manager) =>
        this.sessionRepo.save(session.markExpired(), manager),
      );
    }
    if (
      session.status !== 'PENDING_AUTHORIZATION' ||
      session.isExpired(new Date())
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Phiên kết nối đã hết hạn hoặc đã được sử dụng.',
      );
    }

    // External call stays outside the transaction (AGENTS.md: don't call
    // external APIs inside a transaction) — only the DB writes below are wrapped.
    const { accessToken } = await this.adapter.exchangeToken(input.publicToken);
    const accountIdentity = await this.adapter.getAccountIdentity(accessToken);

    return this.dataSource.transaction(async (manager) => {
      // Active bank-connection plan gate (issue #101): the count is deferred
      // so it runs AFTER PlanLimitService acquires the org subscription lock —
      // counting first would let concurrent exchanges both pass on a limit-1
      // plan. The count itself is manager-scoped (same transaction).
      await this.planLimitService.enforceBankConnectionLimit(manager, () =>
        this.bankConnectionRepo.countActiveByOrganization(
          session.organizationId,
          manager,
        ),
      );

      const existing = session.bankConnectionId
        ? await this.bankConnectionRepo.findByIdForUpdate(
            session.bankConnectionId,
            manager,
          )
        : null;
      assertReauthorizable(session.bankConnectionId, existing);

      const connection = existing
        ? existing.reactivate({
            casIdConnectionSessionId: session.id,
            encryptedAccessToken: encryptToken(accessToken, this.encryptionKey),
            accountIdentity,
            scopes: session.scopes,
          })
        : new BankConnection({
            id: randomUUID(),
            organizationId: session.organizationId,
            casIdConnectionSessionId: session.id,
            encryptedAccessToken: encryptToken(accessToken, this.encryptionKey),
            accountIdentity,
            status: 'ACTIVE',
            scopes: session.scopes,
            connectedAt: new Date(),
            lastSyncAt: null,
            revokedAt: null,
            createdAt: new Date(),
          });

      await this.bankConnectionRepo.save(connection, manager);
      await this.sessionRepo.save(session.markCompleted(), manager);
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: connection.organizationId,
          bankConnectionId: connection.id,
          eventType: existing ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
          metadata: { accountNumber: accountIdentity.accountNumber },
          createdAt: new Date(),
        }),
        manager,
      );
      return connection;
    });
  }
}
