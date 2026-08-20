import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ReceiveWebhookUseCase } from '../application/receive-webhook.usecase';
import { BalanceHookDto } from './dto/balance-hook.dto';
import { WebhookRateLimitGuard } from './webhook-rate-limit.guard';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly receiveWebhook: ReceiveWebhookUseCase) {}

  @Post('casso-balance-hook')
  @Public()
  @ApiOperation({
    summary: 'Receive a Casso Flow balance-hook notification',
    description:
      "Authenticated by a per-authorization secret registered with Casso Flow — Casso sends the V2 HMAC signature on the 'X-Casso-Signature' header, verified against the resolved authorization inside ReceiveWebhookUseCase.",
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
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  @UseGuards(WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveBalanceHook(
    @Body() payload: BalanceHookDto,
    @Headers('x-casso-signature') signature: string | undefined,
  ) {
    return this.receiveWebhook.execute({
      accountNumber: payload.data.accountNumber,
      webhookSignature: signature ?? '',
      transactionId: String(payload.data.id),
      rawPayload: Object.fromEntries(Object.entries(payload)),
    });
  }
}
