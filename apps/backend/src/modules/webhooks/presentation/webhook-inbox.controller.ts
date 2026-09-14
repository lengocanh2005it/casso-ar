import { Permission } from '@casso-ar/shared-types';
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
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ListWebhookInboxUseCase } from '../application/list-webhook-inbox.usecase';
import { ReprocessWebhookUseCase } from '../application/reprocess-webhook.usecase';
import { WebhookInbox } from '../domain/webhook-inbox';
import { ListWebhookInboxQueryDto } from './dto/list-webhook-inbox-query.dto';
import {
  ListWebhookInboxResponseDto,
  WebhookInboxItemResponse,
} from './dto/webhook-inbox-response.dto';

function toWebhookInboxResponse(inbox: WebhookInbox): WebhookInboxItemResponse {
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

@ApiTags('webhooks-inbox')
@Controller('webhooks/inbox')
@UseGuards(PermissionGuard)
export class WebhookInboxController {
  constructor(
    private readonly listWebhookInboxUseCase: ListWebhookInboxUseCase,
    private readonly reprocessWebhookUseCase: ReprocessWebhookUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List received webhook notifications' })
  @ApiOkResponse({ type: ListWebhookInboxResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.WEBHOOK_INBOX_READ)
  async findMany(@Query() query: ListWebhookInboxQueryDto) {
    const result = await this.listWebhookInboxUseCase.execute({
      page: query.page,
      limit: query.limit,
      ...(query.status ? { status: query.status } : {}),
      ...(query.providerTransactionId
        ? { providerTransactionId: query.providerTransactionId }
        : {}),
    });
    return {
      items: result.items.map(toWebhookInboxResponse),
      total: result.total,
    };
  }

  @Post(':id/reprocess')
  @ApiOperation({ summary: 'Reprocess a failed webhook notification' })
  @ApiOkResponse({ type: WebhookInboxItemResponse })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  @HttpCode(200)
  @RequirePermission(Permission.WEBHOOK_INBOX_WRITE)
  async reprocess(@Param('id', ParseUUIDPipe) id: string) {
    const inbox = await this.reprocessWebhookUseCase.execute(id);
    return toWebhookInboxResponse(inbox);
  }
}
