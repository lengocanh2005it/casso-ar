import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_CONVERSATION_REPOSITORY,
  type CopilotMessageRecord,
  type ICopilotConversationRepository,
} from './conversation-repository.port';

@Injectable()
export class GetCopilotConversationMessagesUseCase {
  constructor(
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(conversationId: string): Promise<CopilotMessageRecord[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy cuộc trò chuyện.',
      );
    }
    if (conversation.userId !== user.userId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Bạn không có quyền truy cập cuộc hội thoại này.',
      );
    }
    return this.conversationRepo.listMessages(conversationId);
  }
}
