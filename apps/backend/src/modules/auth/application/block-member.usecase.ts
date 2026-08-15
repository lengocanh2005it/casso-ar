import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { transitionMembershipStatus } from '../../organizations/application/transition-membership-status';
import type { Membership } from '../../organizations/domain/membership';
import { Role } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from './member-notification.port';

export interface BlockMemberInput {
  organizationId: string;
  organizationName: string;
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class BlockMemberUseCase {
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

  async execute(input: BlockMemberInput): Promise<Membership> {
    if (input.actorUserId === input.targetUserId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Không thể tự chặn quyền truy cập của chính mình.',
      );
    }

    const { membership, changed } = await transitionMembershipStatus({
      dataSource: this.dataSource,
      membershipRepo: this.membershipRepo,
      userId: input.targetUserId,
      organizationId: input.organizationId,
      targetStatus: 'BLOCKED',
      notFoundMessage: 'Không tìm thấy thành viên trong tổ chức.',
      validate: (current) => {
        if (current.role === Role.OWNER) {
          throw new AppError(
            ErrorCode.FORBIDDEN,
            'Không thể chặn quyền truy cập của chủ sở hữu tổ chức.',
          );
        }
      },
    });

    if (changed) await this.sendNotification(input);
    return membership;
  }

  private async sendNotification(input: BlockMemberInput): Promise<void> {
    try {
      const user = await this.userRepo.findById(input.targetUserId);
      if (!user) return;
      await this.memberNotificationSender.sendMemberBlockedEmail(
        user.email,
        input.organizationName,
      );
    } catch (error) {
      this.logger?.error({
        message: 'Member block notification enqueue failed',
        emailType: 'MEMBER_BLOCKED',
        organizationId: input.organizationId,
        userId: input.targetUserId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
