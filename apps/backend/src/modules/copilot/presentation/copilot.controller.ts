import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { CancelPendingActionUseCase } from '../application/cancel-pending-action.usecase';
import { ConfirmPendingActionUseCase } from '../application/confirm-pending-action.usecase';
import { CopilotChatUseCase } from '../application/copilot-chat.usecase';
import { DeleteCopilotDraftUseCase } from '../application/delete-copilot-draft.usecase';
import { GetCopilotConversationMessagesUseCase } from '../application/get-copilot-conversation-messages.usecase';
import { GetCopilotUsageUseCase } from '../application/get-copilot-usage.usecase';
import { ListCopilotConversationsUseCase } from '../application/list-copilot-conversations.usecase';
import { ListCopilotDraftsUseCase } from '../application/list-copilot-drafts.usecase';
import { ReopenCopilotDraftUseCase } from '../application/reopen-copilot-draft.usecase';
import { UpdateCopilotDraftUseCase } from '../application/update-copilot-draft.usecase';
import { CopilotRateLimitGuard } from './copilot-rate-limit.guard';
import { CopilotDraftsQueryDto } from './dto/copilot-drafts-query.dto';
import {
  CopilotChatResponseDto,
  CopilotConversationMessagesDto,
  CopilotConversationsPageDto,
  CopilotDraftDto,
  CopilotDraftsPageDto,
  CopilotPendingActionDto,
  CopilotUsageResponseDto,
  ReopenCopilotDraftResponseDto,
  toCopilotConversationMessagesDto,
  toCopilotConversationsPageResponse,
  toCopilotDraftDto,
  toCopilotDraftsPageResponse,
  toCopilotMessageDto,
  toCopilotPendingActionDto,
} from './dto/copilot-response.dto';
import { PostCopilotMessageDto } from './dto/post-copilot-message.dto';
import { UpdateCopilotDraftDto } from './dto/update-copilot-draft.dto';

@ApiTags('copilot')
@Controller('copilot')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CopilotController {
  constructor(
    private readonly copilotChatUseCase: CopilotChatUseCase,
    private readonly confirmPendingActionUseCase: ConfirmPendingActionUseCase,
    private readonly cancelPendingActionUseCase: CancelPendingActionUseCase,
    private readonly getCopilotUsageUseCase: GetCopilotUsageUseCase,
    private readonly listCopilotDraftsUseCase: ListCopilotDraftsUseCase,
    private readonly reopenCopilotDraftUseCase: ReopenCopilotDraftUseCase,
    private readonly updateCopilotDraftUseCase: UpdateCopilotDraftUseCase,
    private readonly deleteCopilotDraftUseCase: DeleteCopilotDraftUseCase,
    private readonly listCopilotConversationsUseCase: ListCopilotConversationsUseCase,
    private readonly getCopilotConversationMessagesUseCase: GetCopilotConversationMessagesUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('usage')
  @ApiOperation({ summary: 'Get Copilot usage against the plan limit' })
  @ApiOkResponse({ type: CopilotUsageResponseDto })
  @ApiErrorResponse(ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN)
  @RequirePermission(Permission.RECEIVABLE_READ)
  async usage() {
    return this.getCopilotUsageUseCase.execute();
  }

  @Get('drafts')
  @ApiOperation({ summary: 'List Copilot email drafts' })
  @ApiOkResponse({ type: CopilotDraftsPageDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @RequirePermission(Permission.RECEIVABLE_READ)
  async listDrafts(@Query() query: CopilotDraftsQueryDto) {
    const page = await this.listCopilotDraftsUseCase.execute(
      query.page,
      query.limit,
      query.status,
    );
    return toCopilotDraftsPageResponse(page);
  }

  @Post('drafts/:id/reopen')
  @ApiOperation({ summary: 'Reopen a Copilot draft into a conversation' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: ReopenCopilotDraftResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async reopenDraft(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /copilot/drafts/:id/reopen',
      idempotencyKey,
      { id },
      async () => {
        const result = await this.reopenCopilotDraftUseCase.execute(id);
        return {
          conversationId: result.conversationId,
          pendingAction: toCopilotPendingActionDto(result.pendingAction),
        };
      },
    );
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: 'Update a Copilot email draft' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CopilotDraftDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateCopilotDraftDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      'PATCH /copilot/drafts/:id',
      idempotencyKey,
      { id, ...dto },
      async () =>
        toCopilotDraftDto(
          await this.updateCopilotDraftUseCase.execute({
            id,
            subject: dto.subject,
            bodyHtml: dto.bodyHtml,
          }),
        ),
    );
  }

  @Delete('drafts/:id')
  @ApiOperation({ summary: 'Delete a Copilot email draft' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'The Copilot email draft was deleted.',
    schema: { ...successResponseSchema(), required: ['success'] },
  })
  @ApiErrorResponse(
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async deleteDraft(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      'DELETE /copilot/drafts/:id',
      idempotencyKey,
      { id },
      async () => {
        await this.deleteCopilotDraftUseCase.execute(id);
        return { success: true };
      },
    );
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List Copilot conversations for the current user' })
  @ApiOkResponse({ type: CopilotConversationsPageDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @RequirePermission(Permission.RECEIVABLE_READ)
  async listConversations(@Query() query: PaginationDto) {
    const page = await this.listCopilotConversationsUseCase.execute(
      query.page,
      query.limit,
    );
    return toCopilotConversationsPageResponse(page);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get message history for a Copilot conversation' })
  @ApiOkResponse({ type: CopilotConversationMessagesDto })
  @ApiErrorResponse(
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  @RequirePermission(Permission.RECEIVABLE_READ)
  async getConversationMessages(@Param('id') id: string) {
    const messages =
      await this.getCopilotConversationMessagesUseCase.execute(id);
    return toCopilotConversationMessagesDto(messages);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message to a Copilot conversation' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: CopilotChatResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.INTERNAL_SERVER_ERROR,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Confirm a pending Copilot action' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: CopilotPendingActionDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Cancel a pending Copilot action' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: CopilotPendingActionDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
