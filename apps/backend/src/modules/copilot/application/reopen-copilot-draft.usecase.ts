import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_CONVERSATION_REPOSITORY,
  type ICopilotConversationRepository,
} from './conversation-repository.port';
import { deriveCopilotDraftStatus } from './derive-draft-status';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

@Injectable()
export class ReopenCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    draftId: string,
  ): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const draft = await this.draftRepo.findById(draftId);
    if (!draft || draft.userId !== user.userId) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản nháp email.');
    }

    const latestActions = await this.pendingActionRepo.findLatestForDraftIds([
      draftId,
    ]);
    const status = deriveCopilotDraftStatus(
      latestActions.get(draftId) ?? null,
      new Date(),
    );
    if (status === 'PENDING' || status === 'CONFIRMED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        status === 'PENDING'
          ? 'Bản nháp đang có đề xuất gửi email chờ xử lý.'
          : 'Bản nháp email này đã được gửi.',
      );
    }

    const conversation = await this.conversationRepo.findOrCreate(
      randomUUID(),
      user.userId,
    );
    const pendingAction = await this.pendingActionRepo.create(conversation.id, {
      draftId: draft.id,
      receivableId: draft.receivableId,
    });
    return { conversationId: conversation.id, pendingAction };
  }
}
