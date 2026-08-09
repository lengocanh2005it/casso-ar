import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PENDING_ACTION_EXPIRY_MINUTES } from './confirm-pending-action.usecase';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

@Injectable()
export class CancelPendingActionUseCase {
  constructor(
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
  ) {}

  async execute(
    pendingActionId: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction> {
    const cancelled = await this.pendingActionRepo.cancelIfPending(
      pendingActionId,
      resolvedByUserId,
    );
    if (!cancelled) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Đề xuất gửi email đã được xử lý hoặc không còn hiệu lực.',
      );
    }
    if (
      Date.now() - cancelled.createdAt.getTime() >
      PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000
    ) {
      await this.pendingActionRepo.markExpired(pendingActionId);
      throw new AppError(ErrorCode.CONFLICT, 'Đề xuất gửi email đã hết hạn.');
    }
    return cancelled;
  }
}
