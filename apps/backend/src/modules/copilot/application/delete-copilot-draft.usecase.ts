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
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

@Injectable()
export class DeleteCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    private readonly tenantContext: TenantContextService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(id: string): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await findMutableDraft(
        id,
        user.userId,
        this.draftRepo,
        this.pendingActionRepo,
        manager,
      );
      await this.draftRepo.delete(id, manager);
    });
  }
}
