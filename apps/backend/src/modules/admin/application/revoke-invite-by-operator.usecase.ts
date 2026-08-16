import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from '../../auth/application/membership-invite-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface RevokeInviteByOperatorInput {
  organizationId: string;
  inviteId: string;
  operatorId: string;
}

@Injectable()
export class RevokeInviteByOperatorUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
  ) {}

  async execute(input: RevokeInviteByOperatorInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const invite = await this.inviteRepo.findByIdForUpdate(
        input.inviteId,
        input.organizationId,
        manager,
      );
      if (!invite) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lời mời.');
      }
      if (invite.acceptedAt !== null) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Lời mời đã được chấp nhận, không thể thu hồi.',
        );
      }

      await this.inviteRepo.delete(
        input.inviteId,
        input.organizationId,
        manager,
      );
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'INVITE_REVOKED',
          inviteId: invite.id,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
