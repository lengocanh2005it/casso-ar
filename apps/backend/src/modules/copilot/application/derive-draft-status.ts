import {
  type CopilotPendingActionStatus,
  PENDING_ACTION_EXPIRY_MINUTES,
} from './pending-action-repository.port';

export type CopilotDraftStatus =
  | 'DRAFTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export function deriveCopilotDraftStatus(
  action: { status: CopilotPendingActionStatus; createdAt: Date } | null,
  now: Date,
): CopilotDraftStatus {
  if (!action) return 'DRAFTED';
  if (
    action.status === 'PENDING' &&
    now.getTime() - action.createdAt.getTime() >
      PENDING_ACTION_EXPIRY_MINUTES * 60_000
  ) {
    return 'EXPIRED';
  }
  return action.status;
}
