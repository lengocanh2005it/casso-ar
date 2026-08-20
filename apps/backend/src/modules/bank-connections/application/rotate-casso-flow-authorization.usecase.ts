import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
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
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface RotateCassoFlowAuthorizationInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  apiKey: string;
}

export interface RotateCassoFlowAuthorizationResult {
  rotatedAccountNumbers: string[];
  newlyDiscovered: CassoFlowBankAccount[];
}

@Injectable()
export class RotateCassoFlowAuthorizationUseCase {
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
  ) {}

  async execute(
    input: RotateCassoFlowAuthorizationInput,
  ): Promise<RotateCassoFlowAuthorizationResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    // External calls stay outside the transaction — only the DB writes below are wrapped.
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    this.assertBusinessIdMatches(authorization.businessId, businessId);

    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(input.apiKey, secureToken);

    const currentConnections =
      await this.bankConnectionRepo.findByAuthorizationId(
        input.cassoFlowAuthorizationId,
      );
    const currentAccountNumbers = new Set(
      currentConnections.map((connection) => connection.accountNumber),
    );
    const accountsByNumber = new Map(
      accounts.map((account) => [account.accountNumber, account]),
    );

    const rotatedAccountNumbers: string[] = [];
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.authorizationRepo.findByIdForUpdate(
        input.cassoFlowAuthorizationId,
        manager,
      );
      if (!locked) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy liên kết Casso Flow.',
        );
      }
      this.assertBusinessIdMatches(locked.businessId, businessId);

      const rotatedAuthorization = locked.rotate({
        businessId,
        encryptedApiKey: encryptToken(input.apiKey, this.encryptionKey),
        encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
      });
      await this.authorizationRepo.save(rotatedAuthorization, manager);

      for (const connection of currentConnections) {
        if (connection.status !== 'ACTIVE') continue;
        const matched = accountsByNumber.get(connection.accountNumber);
        if (!matched) continue; // missing from the new key — left untouched

        const rotatedConnection = connection.rotateApiKey({
          bankName: matched.bankName,
          accountHolderName: matched.accountHolderName,
        });
        await this.bankConnectionRepo.save(rotatedConnection, manager);
        await this.auditEventRepo.save(
          new ConnectionAuditEvent({
            id: randomUUID(),
            organizationId: connection.organizationId,
            bankConnectionId: connection.id,
            eventType: 'API_KEY_ROTATED',
            metadata: { accountNumber: connection.accountNumber },
            createdAt: new Date(),
          }),
          manager,
        );
        rotatedAccountNumbers.push(connection.accountNumber);
      }
    });

    const newlyDiscovered = accounts.filter(
      (account) => !currentAccountNumbers.has(account.accountNumber),
    );

    return { rotatedAccountNumbers, newlyDiscovered };
  }

  private assertBusinessIdMatches(
    storedBusinessId: string | null,
    newBusinessId: string,
  ): void {
    if (storedBusinessId !== null && storedBusinessId !== newBusinessId) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Mã doanh nghiệp từ API Key mới không khớp với liên kết hiện tại. Dùng nút "Kết nối ngân hàng" nếu muốn thêm một liên kết mới.',
        { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
      );
    }
  }
}
