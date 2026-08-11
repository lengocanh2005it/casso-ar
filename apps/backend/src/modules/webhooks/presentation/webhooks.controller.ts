import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import {
  type ReceiveWebhookResult,
  ReceiveWebhookUseCase,
} from '../application/receive-webhook.usecase';
import { BalanceHookDto } from './dto/balance-hook.dto';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { WebhookRateLimitGuard } from './webhook-rate-limit.guard';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly receiveWebhook: ReceiveWebhookUseCase) {}

  @Post('casso-balance-hook')
  @Public()
  @UseGuards(WebhookAuthGuard, WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveBalanceHook(
    @Body() payload: BalanceHookDto,
  ): Promise<ReceiveWebhookResult> {
    return this.receiveWebhook.execute({
      bankConnectionId: payload.bankConnectionId,
      organizationId: payload.organizationId,
      transactionId: payload.transactionId,
      rawPayload: Object.fromEntries(Object.entries(payload)),
    });
  }
}
