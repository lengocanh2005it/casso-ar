import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
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

const DEFAULT_SCOPES = ['identity', 'transaction'];
const DEFAULT_REDIRECT_BASE_URL =
  'http://localhost:5173/bank-connections/cas-id/callback';
const DEFAULT_LINK_BASE_URL = 'https://dev.link.bankhub.dev';

export interface InitiateConnectionInput {
  userId: string;
  bankConnectionId?: string;
}

export interface InitiateConnectionResult {
  sessionId: string;
  grantToken: string;
  redirectUri: string;
  linkBaseUrl: string;
}

@Injectable()
export class InitiateConnectionUseCase {
  constructor(
    @Inject(CAS_ID_INTEGRATION_ADAPTER)
    private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(CAS_ID_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepo: ICasIdConnectionSessionRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: InitiateConnectionInput,
  ): Promise<InitiateConnectionResult> {
    const existing = input.bankConnectionId
      ? await this.bankConnectionRepo.findById(input.bankConnectionId)
      : null;
    assertReauthorizable(input.bankConnectionId, existing);

    // The session id is embedded in the redirect URI (OAuth "state" pattern)
    // so the callback page can complete the exchange even if window.opener
    // is unavailable — it never has to guess which pending session this is.
    const sessionId = randomUUID();
    const redirectBaseUrl =
      process.env.CAS_ID_REDIRECT_BASE_URL ?? DEFAULT_REDIRECT_BASE_URL;
    const redirectUri = `${redirectBaseUrl}?sessionId=${sessionId}`;
    const linkBaseUrl =
      process.env.CAS_ID_LINK_BASE_URL ?? DEFAULT_LINK_BASE_URL;

    // External call stays outside the transaction — only the DB writes below are wrapped.
    const { grantToken, expiresAt } = await this.adapter.createGrantToken(
      DEFAULT_SCOPES,
      redirectUri,
    );
    const session = new CasIdConnectionSession({
      id: sessionId,
      organizationId: this.tenantContext.getOrganizationId(),
      initiatedByUserId: input.userId,
      bankConnectionId: existing?.id ?? null,
      grantToken,
      scopes: DEFAULT_SCOPES,
      redirectUri,
      status: 'PENDING_AUTHORIZATION',
      expiresAt,
      createdAt: new Date(),
    });

    await this.dataSource.transaction(async (manager) => {
      await this.sessionRepo.save(session, manager);
      if (existing) {
        await this.auditEventRepo.save(
          new ConnectionAuditEvent({
            id: randomUUID(),
            organizationId: existing.organizationId,
            bankConnectionId: existing.id,
            eventType: 'SESSION_CREATED',
            metadata: { sessionId: session.id },
            createdAt: new Date(),
          }),
          manager,
        );
      }
    });
    return { sessionId: session.id, grantToken, redirectUri, linkBaseUrl };
  }
}
