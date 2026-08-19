import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { IBankConnectionRepository } from '../../bank-connections/application/bank-connection-repository.port';
import { BANK_CONNECTION_REPOSITORY } from '../../bank-connections/application/bank-connection-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
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
  grantId: string;
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
  ) {}

  async execute(input: ReceiveWebhookInput): Promise<ReceiveWebhookResult> {
    const connection = await this.bankConnectionRepo.findByGrantId(
      input.grantId,
    );
    if (
      connection &&
      input.organizationId &&
      input.organizationId !== connection.organizationId
    ) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Webhook organization does not match bank connection',
      );
    }
    if (!connection?.isUsable()) return { received: true, ignored: true };
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
      jobId: input.transactionId,
    });
    return { received: true, duplicate: false };
  }
}
