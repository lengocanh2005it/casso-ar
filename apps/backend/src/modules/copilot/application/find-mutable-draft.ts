import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type CopilotDraftStatus,
  deriveCopilotDraftStatus,
} from './derive-draft-status';
import type {
  CopilotDraft,
  ICopilotDraftRepository,
} from './draft-repository.port';
import type { ICopilotPendingActionRepository } from './pending-action-repository.port';

export interface MutableDraft {
  draft: CopilotDraft;
  status: CopilotDraftStatus;
  pendingActionId: string | null;
}

export async function findMutableDraft(
  draftId: string,
  userId: string,
  draftRepo: ICopilotDraftRepository,
  pendingActionRepo: ICopilotPendingActionRepository,
  manager?: EntityManager,
): Promise<MutableDraft> {
  const draft = manager
    ? await draftRepo.findByIdForUpdate(draftId, manager)
    : await draftRepo.findById(draftId);
  if (!draft || draft.userId !== userId) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản nháp email.');
  }

  const latestActions = await pendingActionRepo.findLatestForDraftIds(
    [draftId],
    manager,
  );
  const latest = latestActions.get(draftId) ?? null;
  const status = deriveCopilotDraftStatus(latest, new Date());
  if (status === 'PENDING' || status === 'CONFIRMED') {
    throw new AppError(
      ErrorCode.CONFLICT,
      status === 'PENDING'
        ? 'Bản nháp đang có đề xuất gửi email chờ xử lý.'
        : 'Bản nháp email này đã được gửi.',
    );
  }

  return { draft, status, pendingActionId: latest?.id ?? null };
}
