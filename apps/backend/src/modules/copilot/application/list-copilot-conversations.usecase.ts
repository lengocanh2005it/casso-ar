import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_CONVERSATION_REPOSITORY,
  type CopilotConversationSummary,
  type ICopilotConversationRepository,
} from './conversation-repository.port';

@Injectable()
export class ListCopilotConversationsUseCase {
  constructor(
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    page: number,
    limit: number,
  ): Promise<{ items: CopilotConversationSummary[]; total: number }> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return this.conversationRepo.listByUser(user.userId, page, limit);
  }
}
