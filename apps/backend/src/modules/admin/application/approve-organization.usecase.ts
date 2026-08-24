import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
import type { OrganizationVerificationMethod } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';
import { transitionPendingOrganization } from './transition-pending-organization';

export interface ApproveOrganizationInput {
  organizationId: string;
  operatorId: string;
  verificationMethod: OrganizationVerificationMethod;
  reason?: string;
}

@Injectable()
export class ApproveOrganizationUseCase {
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

  async execute(input: ApproveOrganizationInput): Promise<void> {
    await transitionPendingOrganization({
      dataSource: this.dataSource,
      organizationRepo: this.organizationRepo,
      auditRepo: this.auditRepo,
      membershipRepo: this.membershipRepo,
      userRepo: this.userRepo,
      organizationId: input.organizationId,
      operatorId: input.operatorId,
      actionType: 'ORGANIZATION_APPROVED',
      verificationMethod: input.verificationMethod,
      reason: input.reason,
      transition: (organization) => organization.approve(),
      notify: (email, name) =>
        this.memberNotificationSender.sendOrganizationApprovedEmail(
          email,
          name,
        ),
    });
  }
}
