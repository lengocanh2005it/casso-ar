import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { IBankConnectionRepository } from '../../bank-connections/application/bank-connection-repository.port';
import { BANK_CONNECTION_REPOSITORY } from '../../bank-connections/application/bank-connection-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WEBHOOK_PROCESSING_QUEUE } from '../infrastructure/webhooks-queue.constants';
import type { IWebhookInboxRepository } from './webhook-inbox-repository.port';
import {
  DuplicateWebhookError,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';

export interface ReceiveWebhookInput {
  bankConnectionId: string;
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
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ReceiveWebhookInput): Promise<ReceiveWebhookResult> {
    const connection = await this.bankConnectionRepo.findByIdUnscoped(
      input.bankConnectionId,
    );
    if (!connection?.isUsable()) return { received: true, ignored: true };
    if (
      input.organizationId &&
      input.organizationId !== connection.organizationId
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Webhook organization does not match bank connection',
      );
    }
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
    await this.queue.add(
      'process-webhook',
      { webhookInboxId: inbox.id, organizationId: inbox.organizationId },
      {
        jobId: input.transactionId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
    return { received: true, duplicate: false };
  }
}
