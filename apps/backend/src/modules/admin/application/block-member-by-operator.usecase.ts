import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from '../../auth/application/auth-email-sender.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface BlockMemberByOperatorInput {
  organizationId: string;
  organizationName: string;
  userId: string;
  operatorId: string;
}

@Injectable()
export class BlockMemberByOperatorUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly authEmailSender: IAuthEmailSender,
  ) {}

  async execute(input: BlockMemberByOperatorInput): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.userId,
      input.organizationId,
    );
    if (!membership) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy thành viên.');
    }
    if (membership.isBlocked()) return;

    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.save(membership.block(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'MEMBER_BLOCKED',
          membershipId: membership.id,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    const user = await this.userRepo.findById(input.userId);
    if (user) {
      await this.authEmailSender.sendMemberBlockedEmail(
        user.email,
        input.organizationName,
      );
    }
  }
}
