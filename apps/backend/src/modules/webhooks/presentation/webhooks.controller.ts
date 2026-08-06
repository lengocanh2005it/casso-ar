import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { Public } from '../../../common/auth/public.decorator';
import type { IBankConnectionRepository } from '../../bank-connections/application/bank-connection-repository.port';
import { BANK_CONNECTION_REPOSITORY } from '../../bank-connections/application/bank-connection-repository.port';
import type { IWebhookInboxRepository } from '../application/webhook-inbox-repository.port';
import {
  DuplicateWebhookError,
  WEBHOOK_INBOX_REPOSITORY,
} from '../application/webhook-inbox-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WEBHOOK_PROCESSING_QUEUE } from '../infrastructure/webhooks-queue.constants';
import { BalanceHookDto } from './dto/balance-hook.dto';
import { WebhookAuthGuard } from './webhook-auth.guard';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly inboxRepo: IWebhookInboxRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  @Post('casso-balance-hook')
  @Public()
  @UseGuards(WebhookAuthGuard)
  @HttpCode(200)
  async receiveBalanceHook(
    @Body() payload: BalanceHookDto,
  ): Promise<{ received: boolean; duplicate?: boolean; ignored?: boolean }> {
    const connection = await this.bankConnectionRepo.findByIdUnscoped(
      payload.bankConnectionId,
    );
    if (!connection?.isUsable()) return { received: true, ignored: true };
    if (
      payload.organizationId &&
      payload.organizationId !== connection.organizationId
    ) {
      throw new BadRequestException(
        'Webhook organization does not match bank connection',
      );
    }
    const inbox = new WebhookInbox({
      id: randomUUID(),
      organizationId: connection.organizationId,
      bankConnectionId: connection.id,
      providerTransactionId: payload.transactionId,
      rawPayload: Object.fromEntries(Object.entries(payload)),
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
        jobId: payload.transactionId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
    return { received: true, duplicate: false };
  }
}
