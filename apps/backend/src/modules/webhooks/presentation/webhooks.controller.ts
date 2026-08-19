import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ReceiveWebhookUseCase } from '../application/receive-webhook.usecase';
import { BalanceHookDto } from './dto/balance-hook.dto';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { WebhookRateLimitGuard } from './webhook-rate-limit.guard';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly receiveWebhook: ReceiveWebhookUseCase) {}

  @Post('casso-balance-hook')
  @Public()
  @ApiOperation({
    summary: 'Receive a Cas ID Balance Hook notification',
    description:
      'Authenticated by source-IP allowlist (Cas ID sends no signature header); returns received/duplicate/ignored status',
  })
  @ApiOkResponse({
    description: 'Webhook accepted for processing',
    schema: {
      type: 'object',
      properties: {
        received: { type: 'boolean', example: true },
        duplicate: { type: 'boolean', example: false },
        ignored: { type: 'boolean', example: false },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.TENANT_MISMATCH,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  @UseGuards(WebhookAuthGuard, WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveBalanceHook(@Body() payload: BalanceHookDto) {
    return this.receiveWebhook.execute({
      grantId: payload.grantId,
      transactionId: payload.transaction.id,
      rawPayload: Object.fromEntries(Object.entries(payload)),
    });
  }
}
