import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildFrontendUrl } from '../../../common/config/frontend-url';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { MembershipInvite } from '../domain/membership-invite';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';
import { generateToken } from './token-hasher';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ResendInviteUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(inviteId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
    }

    // Delete the old invite and create the replacement in one transaction —
    // deleting first outside a transaction could lose the invite if creating
    // the new one fails. The email send runs after commit.
    const { invite, token } = await this.dataSource.transaction(
      async (manager) => {
        const currentInvite = await this.inviteRepo.findByIdForUpdate(
          inviteId,
          organizationId,
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

        await this.inviteRepo.delete(inviteId, organizationId, manager);
        await this.inviteRepo.save(invite, manager);

        return { invite, token };
      },
    );

    await this.emailSender.sendInviteEmail(
      invite.email,
      buildFrontendUrl(`/invite-accept?token=${token}`),
      organization.name,
    );
  }
}
