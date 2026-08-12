import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListWebhookInboxUseCase } from '../application/list-webhook-inbox.usecase';
import { ReprocessWebhookUseCase } from '../application/reprocess-webhook.usecase';
import { WebhookInbox } from '../domain/webhook-inbox';
import { ListWebhookInboxQuery } from './dto/list-webhook-inbox.query';

function toWebhookInboxResponse(inbox: WebhookInbox) {
  return {
    id: inbox.id,
    bankConnectionId: inbox.bankConnectionId,
    providerTransactionId: inbox.providerTransactionId,
    rawPayload: inbox.rawPayload,
    receivedAt: inbox.receivedAt,
    status: inbox.status,
    processedAt: inbox.processedAt,
    errorMessage: inbox.errorMessage,
    retryCount: inbox.retryCount,
  };
}

@Controller('webhooks/inbox')
@UseGuards(PermissionGuard)
export class WebhookInboxController {
  constructor(
    private readonly listWebhookInboxUseCase: ListWebhookInboxUseCase,
    private readonly reprocessWebhookUseCase: ReprocessWebhookUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.WEBHOOK_INBOX_READ)
  async findMany(@Query() query: ListWebhookInboxQuery) {
    const result = await this.listWebhookInboxUseCase.execute({
      page: query.page,
      limit: query.limit,
      ...(query.status ? { status: query.status } : {}),
    });
    return {
      items: result.items.map(toWebhookInboxResponse),
      total: result.total,
    };
  }

  @Post(':id/reprocess')
  @HttpCode(200)
  @RequirePermission(Permission.WEBHOOK_INBOX_READ)
  async reprocess(@Param('id', ParseUUIDPipe) id: string) {
    const inbox = await this.reprocessWebhookUseCase.execute(id);
    return toWebhookInboxResponse(inbox);
  }
}
