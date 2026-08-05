import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
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

const DEFAULT_SCOPES = ['identity', 'transaction'];

export interface InitiateConnectionInput {
  userId: string;
  redirectUri: string;
  bankConnectionId?: string;
}

export interface InitiateConnectionResult {
  sessionId: string;
  grantToken: string;
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
  ) {}

  async execute(
    input: InitiateConnectionInput,
  ): Promise<InitiateConnectionResult> {
    const existing = input.bankConnectionId
      ? await this.bankConnectionRepo.findById(input.bankConnectionId)
      : null;
    if (
      input.bankConnectionId &&
      (!existing || existing.status !== 'REQUIRES_REAUTHORIZATION')
    ) {
      throw new Error('Bank connection is not awaiting reauthorization');
    }

    const { grantToken, expiresAt } = await this.adapter.createGrantToken(
      DEFAULT_SCOPES,
      input.redirectUri,
    );
    const session = new CasIdConnectionSession({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      initiatedByUserId: input.userId,
      bankConnectionId: existing?.id ?? null,
      grantToken,
      scopes: DEFAULT_SCOPES,
      redirectUri: input.redirectUri,
      status: 'PENDING_AUTHORIZATION',
      expiresAt,
      createdAt: new Date(),
    });
    await this.sessionRepo.save(session);

    if (existing) {
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          bankConnectionId: existing.id,
          eventType: 'SESSION_CREATED',
          metadata: { sessionId: session.id },
          createdAt: new Date(),
        }),
      );
    }
    return { sessionId: session.id, grantToken };
  }
}
