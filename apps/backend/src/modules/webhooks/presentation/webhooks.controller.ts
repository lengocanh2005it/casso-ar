import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/auth/public.decorator';
import {
  type ReceiveWebhookResult,
  ReceiveWebhookUseCase,
} from '../application/receive-webhook.usecase';
import { BalanceHookDto } from './dto/balance-hook.dto';
import { WebhookAuthGuard } from './webhook-auth.guard';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly receiveWebhook: ReceiveWebhookUseCase) {}

  @Post('casso-balance-hook')
  @Public()
  @UseGuards(WebhookAuthGuard)
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
