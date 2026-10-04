import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
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
import { Role } from '../../organizations/domain/membership';
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
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly logger?: JsonLogger,
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
      if (error instanceof DuplicateWebhookError) {
        return this.repairDuplicateDelivery(input, connection.organizationId);
      }
      throw error;
    }
    const jobId = `tx-${input.transactionId}`;
    try {
      await this.webhookJobQueue.enqueue({
        webhookInboxId: inbox.id,
        organizationId: inbox.organizationId,
        jobId,
      });
    } catch (error) {
      // The inbox is persisted but has no job. Rethrow so the provider retries
      // the delivery (which repairs the enqueue), and log loudly so a queue
      // outage is visible even if the provider never retries. #421
      await this.logEnqueueFailure(inbox, jobId, error);
      throw error;
    }
    return { received: true, duplicate: false };
  }

  /**
   * #421: the unique key means the inbox for this provider transaction is
   * already persisted. If it never reached the queue (the enqueue after the
   * insert failed), schedule the missing job now instead of dropping the
   * delivery on the floor. PROCESSED is terminal and FAILED already has the
   * operator-facing reprocess path, so only RECEIVED is repaired here.
   */
  private async repairDuplicateDelivery(
    input: ReceiveWebhookInput,
    organizationId: string,
  ): Promise<ReceiveWebhookResult> {
    const existing = await this.inboxRepo.findByProviderTransactionId(
      input.transactionId,
      organizationId,
    );
    if (existing?.status !== 'RECEIVED') {
      return { received: true, duplicate: true };
    }
    try {
      await this.webhookJobQueue.enqueue({
        webhookInboxId: existing.id,
        organizationId: existing.organizationId,
        jobId: `tx-${input.transactionId}`,
      });
      // The repair is invisible to the provider on purpose: the delivery is
      // still a duplicate, it just no longer leaves the inbox unscheduled.
      return { received: true, duplicate: true };
    } catch (error) {
      // Re-throw so the provider sees a non-2xx and retries the delivery; the
      // sweeper is the backstop when the provider does not.
      await this.logEnqueueFailure(
        existing,
        `tx-${input.transactionId}`,
        error,
      );
      throw error;
    }
  }

  private async logEnqueueFailure(
    inbox: WebhookInbox,
    jobId: string,
    error: unknown,
  ): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: inbox.organizationId,
        role: Role.OWNER,
      },
      async () => {
        this.logger?.error(
          {
            message: 'Webhook inbox persisted but could not be enqueued',
            webhookInboxId: inbox.id,
            organizationId: inbox.organizationId,
            providerTransactionId: inbox.providerTransactionId,
            jobId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          error instanceof Error ? error.stack : undefined,
          ReceiveWebhookUseCase.name,
        );
      },
    );
  }
}
