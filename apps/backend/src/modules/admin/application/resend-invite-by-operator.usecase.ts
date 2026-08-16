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
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from '../../auth/application/membership-invite-repository.port';
import { generateToken } from '../../auth/application/token-hasher';
import { MembershipInvite } from '../../auth/domain/membership-invite';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResendInviteByOperatorInput {
  organizationId: string;
  inviteId: string;
  operatorId: string;
}

@Injectable()
export class ResendInviteByOperatorUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
  ) {}

  async execute(input: ResendInviteByOperatorInput): Promise<void> {
    const organization = await this.organizationRepo.findById(
      input.organizationId,
    );
    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
    }

    const { invite, token } = await this.dataSource.transaction(
      async (manager) => {
        const currentInvite = await this.inviteRepo.findByIdForUpdate(
          input.inviteId,
          input.organizationId,
          manager,
        );
        if (!currentInvite) {
          throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lời mời.');
        }
        if (currentInvite.acceptedAt !== null) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Lời mời đã được chấp nhận, không thể gửi lại.',
          );
        }

        const { token, hash } = generateToken();
        const invite = new MembershipInvite({
          id: randomUUID(),
          organizationId: currentInvite.organizationId,
          email: currentInvite.email,
          role: currentInvite.role,
          invitedByUserId: currentInvite.invitedByUserId,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          acceptedAt: null,
          createdAt: new Date(),
        });

        await this.inviteRepo.delete(
          input.inviteId,
          input.organizationId,
          manager,
        );
        await this.inviteRepo.save(invite, manager);
        await this.auditRepo.save(
          new OperatorAuditLog({
            id: randomUUID(),
            operatorId: input.operatorId,
            organizationId: input.organizationId,
            actionType: 'INVITE_RESENT',
            inviteId: input.inviteId,
            createdAt: new Date(),
          }),
          manager,
        );

        return { invite, token };
      },
    );

    try {
      await this.emailSender.sendInviteEmail(
        invite.email,
        `/invites/accept?token=${token}`,
        organization.name,
      );
    } catch (error) {
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Gửi email thất bại.',
      );
    }
  }
}
