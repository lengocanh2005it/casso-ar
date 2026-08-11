import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { CancelPendingActionUseCase } from '../application/cancel-pending-action.usecase';
import { ConfirmPendingActionUseCase } from '../application/confirm-pending-action.usecase';
import { CopilotChatUseCase } from '../application/copilot-chat.usecase';
import { GetCopilotUsageUseCase } from '../application/get-copilot-usage.usecase';
import { CopilotRateLimitGuard } from './copilot-rate-limit.guard';
import {
  type CopilotChatResponseDto,
  toCopilotMessageDto,
  toCopilotPendingActionDto,
} from './dto/copilot-response.dto';
import { PostCopilotMessageDto } from './dto/post-copilot-message.dto';

@Controller('copilot')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CopilotController {
  constructor(
    private readonly copilotChatUseCase: CopilotChatUseCase,
    private readonly confirmPendingActionUseCase: ConfirmPendingActionUseCase,
    private readonly cancelPendingActionUseCase: CancelPendingActionUseCase,
    private readonly getCopilotUsageUseCase: GetCopilotUsageUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('usage')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async usage() {
    return this.getCopilotUsageUseCase.execute();
  }

  @Post('conversations/:id/messages')
  @UseGuards(CopilotRateLimitGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequirePermission(Permission.RECEIVABLE_READ)
  async postMessage(
    @Param('id') conversationId: string,
    @Body() dto: PostCopilotMessageDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<CopilotChatResponseDto> {
    return this.idempotency.execute(
      `POST /copilot/conversations/${conversationId}/messages`,
      idempotencyKey,
      dto,
      async () => {
        const result = await this.copilotChatUseCase.execute({
          conversationId,
          userMessage: dto.content,
        });
        return {
          message: toCopilotMessageDto(result.message),
          pendingAction: result.pendingAction
            ? toCopilotPendingActionDto(result.pendingAction)
            : null,
        };
      },
    );
  }

  @Post('actions/:actionId/confirm')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async confirm(
    @Param('actionId') actionId: string,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.idempotency.execute(
      'POST /copilot/actions/:id/confirm',
      idempotencyKey,
      { actionId },
      () => this.confirmPendingActionUseCase.execute(actionId, user.userId),
    );
  }

  @Post('actions/:actionId/cancel')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async cancel(
    @Param('actionId') actionId: string,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.idempotency.execute(
      'POST /copilot/actions/:id/cancel',
      idempotencyKey,
      { actionId },
      async () =>
        toCopilotPendingActionDto(
          await this.cancelPendingActionUseCase.execute(actionId, user.userId),
        ),
    );
  }
}
