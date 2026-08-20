import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from '../../bank-connections/application/bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from '../../bank-connections/application/casso-flow-authorization-repository.port';
import { decryptToken } from '../../bank-connections/application/token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from '../../bank-connections/application/token-encryption-key';
import { WebhookInbox } from '../domain/webhook-inbox';
import { verifyCassoWebhookSignature } from './casso-webhook-signature';
import type { IWebhookInboxRepository } from './webhook-inbox-repository.port';
import {
  DuplicateWebhookError,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';
import {
  type IWebhookJobQueue,
  WEBHOOK_JOB_QUEUE,
} from './webhook-job-queue.port';

export interface ReceiveWebhookInput {
  accountNumber: string;
  webhookSignature: string;
  organizationId?: string;
  transactionId: string;
  rawPayload: Record<string, unknown>;
}

export interface ReceiveWebhookResult {
  received: boolean;
  duplicate?: boolean;
  ignored?: boolean;
}

@Injectable()
export class ReceiveWebhookUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly inboxRepo: IWebhookInboxRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(WEBHOOK_JOB_QUEUE)
    private readonly webhookJobQueue: IWebhookJobQueue,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  async execute(input: ReceiveWebhookInput): Promise<ReceiveWebhookResult> {
    const connection = await this.bankConnectionRepo.findByAccountNumber(
      input.accountNumber,
    );
    if (!connection) return { received: true, ignored: true };

    const authorization = await this.authorizationRepo.findByIdUnscoped(
      connection.cassoFlowAuthorizationId,
    );
    if (!authorization) return { received: true, ignored: true };

    const expectedSecret = decryptToken(
      authorization.encryptedSecureToken,
      this.encryptionKey,
    );
    if (
      !verifyCassoWebhookSignature({
        payload: input.rawPayload,
        signatureHeader: input.webhookSignature,
        secret: expectedSecret,
      })
    ) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Chữ ký webhook không hợp lệ.',
      );
    }
    if (
      connection &&
      input.organizationId &&
      input.organizationId !== connection.organizationId
    ) {
      return { received: true, ignored: true };
    }
    if (!connection.isUsable()) return { received: true, ignored: true };

    const inbox = new WebhookInbox({
      id: randomUUID(),
      organizationId: connection.organizationId,
      bankConnectionId: connection.id,
      providerTransactionId: input.transactionId,
      rawPayload: input.rawPayload,
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });
    try {
      await this.dataSource.transaction((manager) =>
        this.inboxRepo.insert(inbox, manager),
      );
    } catch (error) {
      if (error instanceof DuplicateWebhookError)
        return { received: true, duplicate: true };
      throw error;
    }
    await this.webhookJobQueue.enqueue({
      webhookInboxId: inbox.id,
      organizationId: inbox.organizationId,
      jobId: `tx-${input.transactionId}`,
    });
    return { received: true, duplicate: false };
  }
}
