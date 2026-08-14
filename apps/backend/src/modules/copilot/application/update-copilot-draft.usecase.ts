import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
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
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(input: UpdateCopilotDraftInput): Promise<CopilotDraftListItem> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const { draft, status, pendingActionId } = await findMutableDraft(
        input.id,
        user.userId,
        this.draftRepo,
        this.pendingActionRepo,
        manager,
      );

      const updated = {
        ...draft,
        subject: input.subject ?? draft.subject,
        bodyHtml: input.bodyHtml ?? draft.bodyHtml,
      };
      await this.draftRepo.save(updated, manager);

      return { ...updated, status, pendingActionId };
    });
  }
}
