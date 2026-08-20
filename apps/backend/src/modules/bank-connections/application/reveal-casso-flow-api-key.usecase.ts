import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { comparePassword } from '../../auth/application/password-hasher';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
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
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { decryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface RevealCassoFlowApiKeyInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  userId: string;
  password: string;
}

export interface RevealCassoFlowApiKeyResult {
  apiKey: string;
}

@Injectable()
export class RevealCassoFlowApiKeyUseCase {
  constructor(
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
  ) {}

  async execute(
    input: RevealCassoFlowApiKeyInput,
  ): Promise<RevealCassoFlowApiKeyResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Mật khẩu không đúng.');
    }

    const apiKey = decryptToken(
      authorization.encryptedApiKey,
      this.encryptionKey,
    );

    const connections = await this.bankConnectionRepo.findByAuthorizationId(
      input.cassoFlowAuthorizationId,
    );
    const now = new Date();
    for (const connection of connections) {
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: input.organizationId,
          bankConnectionId: connection.id,
          eventType: 'API_KEY_REVEALED',
          metadata: { revealedByUserId: input.userId },
          createdAt: now,
        }),
      );
    }

    return { apiKey };
  }
}
