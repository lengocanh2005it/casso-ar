import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
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
  ) {}

  async execute(input: ExchangeTokenInput): Promise<BankConnection> {
    const session = await this.sessionRepo.findById(input.sessionId);
    if (!session)
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiên kết nối.');
    if (
      session.status !== 'PENDING_AUTHORIZATION' ||
      session.isExpired(new Date())
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Phiên kết nối đã hết hạn hoặc đã được sử dụng.',
      );
    }

    const { accessToken } = await this.adapter.exchangeToken(input.publicToken);
    const accountIdentity = await this.adapter.getAccountIdentity(accessToken);
    const existing = session.bankConnectionId
      ? await this.bankConnectionRepo.findById(session.bankConnectionId)
      : null;
    if (
      session.bankConnectionId &&
      (!existing || existing.status !== 'REQUIRES_REAUTHORIZATION')
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Kết nối ngân hàng không ở trạng thái cần xác thực lại.',
      );
    }

    const connection = existing
      ? existing.reactivate({
          casIdConnectionSessionId: session.id,
          encryptedAccessToken: encryptToken(accessToken),
          accountIdentity,
          scopes: session.scopes,
        })
      : new BankConnection({
          id: randomUUID(),
          organizationId: session.organizationId,
          casIdConnectionSessionId: session.id,
          encryptedAccessToken: encryptToken(accessToken),
          accountIdentity,
          status: 'ACTIVE',
          scopes: session.scopes,
          connectedAt: new Date(),
          lastSyncAt: null,
          revokedAt: null,
          createdAt: new Date(),
        });

    await this.bankConnectionRepo.save(connection);
    await this.sessionRepo.save(session.markCompleted());
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connection.id,
        eventType: existing ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
        metadata: { accountNumber: accountIdentity.accountNumber },
        createdAt: new Date(),
      }),
    );
    return connection;
  }
}
