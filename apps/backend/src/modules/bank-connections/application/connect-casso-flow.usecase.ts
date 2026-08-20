import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
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
  type CassoFlowBankAccount,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { maskApiKey } from './mask-api-key';
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface ConnectCassoFlowInput {
  organizationId: string;
  apiKey: string;
  selectedAccountNumbers: string[];
  userId: string;
}

export interface ConnectCassoFlowConnectedItem {
  connectionId: string;
  accountNumber: string;
}

export type ConnectCassoFlowSkippedReason =
  | 'PLAN_LIMIT_EXCEEDED'
  | 'TAKEN_BY_ANOTHER_ORG';

export interface ConnectCassoFlowSkippedItem {
  accountNumber: string;
  reason: ConnectCassoFlowSkippedReason;
}

export interface ConnectCassoFlowResult {
  connected: ConnectCassoFlowConnectedItem[];
  skipped: ConnectCassoFlowSkippedItem[];
}

@Injectable()
export class ConnectCassoFlowUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async execute(input: ConnectCassoFlowInput): Promise<ConnectCassoFlowResult> {
    // External call stays outside any transaction — only the DB writes below are wrapped.
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    const maskedApiKey = maskApiKey(input.apiKey);
    const selected = new Set(input.selectedAccountNumbers);
    const candidates = accounts.filter((account) =>
      selected.has(account.accountNumber),
    );
    const existing = await this.bankConnectionRepo.findByAccountNumbers(
      candidates.map((account) => account.accountNumber),
    );

    const skipped: ConnectCassoFlowSkippedItem[] = [];
    const eligible = candidates.filter((account) => {
      const row = existing.get(account.accountNumber);
      if (row && row.organizationId !== input.organizationId) {
        skipped.push({
          accountNumber: account.accountNumber,
          reason: 'TAKEN_BY_ANOTHER_ORG',
        });
        return false;
      }
      return true;
    });

    // Nothing eligible: do not touch CassoFlowAuthorization or call
    // registerWebhook. Two different orgs can hold the same real API Key
    // (Casso's own trust model) — re-registering the webhook here for a
    // request that connects nothing would silently break whichever other
    // org's webhook delivery this key already serves.
    if (eligible.length === 0) {
      return { connected: [], skipped };
    }

    const authorization = await this.findOrCreateAuthorization(
      input.organizationId,
      input.apiKey,
      businessId,
    );

    const connected: ConnectCassoFlowConnectedItem[] = [];
    for (const account of eligible) {
      const connectionId = await this.connectOne(
        input.organizationId,
        account,
        existing.get(account.accountNumber) ?? null,
        authorization.id,
        input.userId,
        maskedApiKey,
      );
      if (connectionId === null) {
        skipped.push({
          accountNumber: account.accountNumber,
          reason: 'PLAN_LIMIT_EXCEEDED',
        });
        break; // once over the limit, every remaining account will be too
      }
      connected.push({ connectionId, accountNumber: account.accountNumber });
    }

    return { connected, skipped };
  }

  private async findOrCreateAuthorization(
    organizationId: string,
    apiKey: string,
    businessId: string,
  ): Promise<CassoFlowAuthorization> {
    const existingAuthorization =
      await this.authorizationRepo.findByBusinessIdForOrganization(
        businessId,
        organizationId,
      );
    if (existingAuthorization) return existingAuthorization;

    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(apiKey, secureToken);
    const authorization = new CassoFlowAuthorization({
      id: randomUUID(),
      organizationId,
      businessId,
      encryptedApiKey: encryptToken(apiKey, this.encryptionKey),
      encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
      createdAt: new Date(),
    });
    await this.authorizationRepo.save(authorization);
    return authorization;
  }

  private async connectOne(
    organizationId: string,
    account: CassoFlowBankAccount,
    existingConnection: BankConnection | null,
    cassoFlowAuthorizationId: string,
    userId: string,
    maskedApiKey: string,
  ): Promise<string | null> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.planLimitService.enforceBankConnectionLimit(manager, () =>
          this.bankConnectionRepo.countActiveByOrganization(
            organizationId,
            manager,
          ),
        );
        const now = new Date();
        const connection =
          existingConnection && existingConnection.status !== 'ACTIVE'
            ? existingConnection.reactivate({
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountHolderName: account.accountHolderName,
                cassoFlowAuthorizationId,
              })
            : new BankConnection({
                id: randomUUID(),
                organizationId,
                cassoFlowAuthorizationId,
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountHolderName: account.accountHolderName,
                status: 'ACTIVE',
                connectedAt: now,
                lastSyncAt: null,
                revokedAt: null,
                createdAt: now,
              });
        await this.bankConnectionRepo.save(connection, manager);
        await this.auditEventRepo.save(
          new ConnectionAuditEvent({
            id: randomUUID(),
            organizationId: connection.organizationId,
            bankConnectionId: connection.id,
            eventType: existingConnection ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
            metadata: {
              accountNumber: account.accountNumber,
              actorUserId: userId,
              maskedApiKey,
            },
            createdAt: now,
          }),
          manager,
        );
        return connection.id;
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        error.errorCode === ErrorCode.PLAN_LIMIT_EXCEEDED
      ) {
        return null;
      }
      throw error;
    }
  }
}
