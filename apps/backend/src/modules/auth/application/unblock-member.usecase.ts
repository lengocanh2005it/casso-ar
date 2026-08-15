import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { transitionMembershipStatus } from '../../organizations/application/transition-membership-status';
import type { Membership } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from './member-notification.port';

export interface UnblockMemberInput {
  organizationId: string;
  organizationName: string;
  targetUserId: string;
}

@Injectable()
export class UnblockMemberUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
    private readonly dataSource: DataSource,
    @Optional() private readonly logger?: JsonLogger,
  ) {}

  async execute(input: UnblockMemberInput): Promise<Membership> {
    const { membership, changed } = await transitionMembershipStatus({
      dataSource: this.dataSource,
      membershipRepo: this.membershipRepo,
      userId: input.targetUserId,
      organizationId: input.organizationId,
      targetStatus: 'ACTIVE',
      notFoundMessage: 'Không tìm thấy thành viên trong tổ chức.',
    });

    if (changed) await this.sendNotification(input);
    return membership;
  }

  private async sendNotification(input: UnblockMemberInput): Promise<void> {
    try {
      const user = await this.userRepo.findById(input.targetUserId);
      if (!user) return;
      await this.memberNotificationSender.sendMemberUnblockedEmail(
        user.email,
        input.organizationName,
      );
    } catch (error) {
      this.logger?.error({
        message: 'Member unblock notification enqueue failed',
        emailType: 'MEMBER_UNBLOCKED',
        organizationId: input.organizationId,
        userId: input.targetUserId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
