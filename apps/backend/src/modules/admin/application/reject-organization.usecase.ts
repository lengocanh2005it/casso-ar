import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from '../../auth/application/member-notification.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface RejectOrganizationInput {
  organizationId: string;
  operatorId: string;
  reason: string;
}

@Injectable()
export class RejectOrganizationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
  ) {}

  async execute(input: RejectOrganizationInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const organization = await this.organizationRepo.findById(
        input.organizationId,
        manager,
      );
      if (!organization) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
      }
      if (organization.status !== 'PENDING_REVIEW') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Tổ chức không ở trạng thái chờ duyệt.',
        );
      }

      await this.organizationRepo.save(organization.reject(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'ORGANIZATION_REJECTED',
          reason: input.reason,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    const owner = await this.membershipRepo.findOwnerByOrganization(
      input.organizationId,
    );
    if (!owner) return;
    const ownerUser = await this.userRepo.findById(owner.userId);
    if (!ownerUser) return;
    const organization = await this.organizationRepo.findById(
      input.organizationId,
    );
    await this.memberNotificationSender.sendOrganizationRejectedEmail(
      ownerUser.email,
      organization?.name ?? '',
    );
  }
}
