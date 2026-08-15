import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from '../../auth/application/member-notification.port';
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
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface UnblockMemberByOperatorInput {
  organizationId: string;
  organizationName: string;
  userId: string;
  operatorId: string;
}

@Injectable()
export class UnblockMemberByOperatorUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
    @Optional() private readonly logger?: JsonLogger,
  ) {}

  async execute(input: UnblockMemberByOperatorInput): Promise<Membership> {
    const { membership, changed } = await transitionMembershipStatus({
      dataSource: this.dataSource,
      membershipRepo: this.membershipRepo,
      userId: input.userId,
      organizationId: input.organizationId,
      targetStatus: 'ACTIVE',
      notFoundMessage: 'Không tìm thấy thành viên.',
      onChanged: async (unblocked, manager) => {
        await this.auditRepo.save(
          new OperatorAuditLog({
            id: randomUUID(),
            operatorId: input.operatorId,
            organizationId: input.organizationId,
            actionType: 'MEMBER_UNBLOCKED',
            membershipId: unblocked.id,
            createdAt: new Date(),
          }),
          manager,
        );
      },
    });

    if (changed) await this.sendNotification(input, 'MEMBER_UNBLOCKED');
    return membership;
  }

  private async sendNotification(
    input: UnblockMemberByOperatorInput,
    emailType: 'MEMBER_UNBLOCKED',
  ): Promise<void> {
    try {
      const user = await this.userRepo.findById(input.userId);
      if (!user) return;
      await this.memberNotificationSender.sendMemberUnblockedEmail(
        user.email,
        input.organizationName,
      );
    } catch (error) {
      this.logger?.error({
        message: 'Member unblock notification enqueue failed',
        emailType,
        organizationId: input.organizationId,
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
