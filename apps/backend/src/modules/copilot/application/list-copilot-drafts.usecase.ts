import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type CopilotDraftStatus,
  deriveCopilotDraftStatus,
} from './derive-draft-status';
import {
  COPILOT_DRAFT_REPOSITORY,
  type CopilotDraft,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

export interface CopilotDraftListItem extends CopilotDraft {
  status: CopilotDraftStatus;
  pendingActionId: string | null;
}

@Injectable()
export class ListCopilotDraftsUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    page: number,
    limit: number,
    status?: CopilotDraftStatus,
  ): Promise<{ items: CopilotDraftListItem[]; total: number }> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const drafts = await this.draftRepo.findAllForUser(user.userId);
    const latestActions = await this.pendingActionRepo.findLatestForDraftIds(
      drafts.map((draft) => draft.id),
    );
    const now = new Date();
    const withStatus: CopilotDraftListItem[] = drafts.map((draft) => {
      const action = latestActions.get(draft.id) ?? null;
      return {
        ...draft,
        status: deriveCopilotDraftStatus(action, now),
        pendingActionId: action?.id ?? null,
      };
    });

    // ponytail: filters/paginates in memory after fetching every draft for
    // the user — swap to SQL-side filtering+pagination if a single user
    // accumulates thousands of drafts (bounded today by the monthly copilot
    // chat limit in PlanLimitService).
    const filtered = status
      ? withStatus.filter((item) => item.status === status)
      : withStatus;
    const start = (page - 1) * limit;
    return {
      items: filtered.slice(start, start + limit),
      total: filtered.length,
    };
  }
}
