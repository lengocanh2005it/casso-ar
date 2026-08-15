import type { JsonLogger } from '../../../common/observability/json-logger.service';
import type { IUserRepository } from '../../users/application/user-repository.port';
import type { IMemberNotificationSender } from './member-notification.port';

export type MemberStatusChangeAction = 'BLOCKED' | 'UNBLOCKED';

interface NotifyMemberStatusChangeInput {
  userRepo: IUserRepository;
  memberNotificationSender: IMemberNotificationSender;
  logger?: JsonLogger;
  targetUserId: string;
  organizationId: string;
  organizationName: string;
  action: MemberStatusChangeAction;
}

// Best-effort notification: failure is logged, never rethrown — the
// membership status change already committed and must not be undone by an
// email/queue outage. Shared by both actor paths (org OWNER and Operator).
export async function notifyMemberStatusChange(
  input: NotifyMemberStatusChangeInput,
): Promise<void> {
  try {
    const user = await input.userRepo.findById(input.targetUserId);
    if (!user) return;
    if (input.action === 'BLOCKED') {
      await input.memberNotificationSender.sendMemberBlockedEmail(
        user.email,
        input.organizationName,
      );
    } else {
      await input.memberNotificationSender.sendMemberUnblockedEmail(
        user.email,
        input.organizationName,
      );
    }
  } catch (error) {
    input.logger?.error({
      message: `Member ${input.action === 'BLOCKED' ? 'block' : 'unblock'} notification enqueue failed`,
      emailType: `MEMBER_${input.action}`,
      organizationId: input.organizationId,
      userId: input.targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
