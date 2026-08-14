import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import { findMutableDraft } from './find-mutable-draft';
import type { CopilotDraftListItem } from './list-copilot-drafts.usecase';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

export interface UpdateCopilotDraftInput {
  id: string;
  subject?: string;
  bodyHtml?: string;
}

@Injectable()
export class UpdateCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: UpdateCopilotDraftInput): Promise<CopilotDraftListItem> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const { draft, status, pendingActionId } = await findMutableDraft(
      input.id,
      user.userId,
      this.draftRepo,
      this.pendingActionRepo,
    );

    const updated = {
      ...draft,
      subject: input.subject ?? draft.subject,
      bodyHtml: input.bodyHtml ?? draft.bodyHtml,
    };
    await this.draftRepo.save(updated);

    return { ...updated, status, pendingActionId };
  }
}
