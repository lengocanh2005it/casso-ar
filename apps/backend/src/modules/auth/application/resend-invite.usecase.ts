import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { InviteMemberUseCase } from './invite-member.usecase';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';

@Injectable()
export class ResendInviteUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly inviteMemberUseCase: InviteMemberUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(inviteId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const invite = await this.inviteRepo.findById(inviteId, organizationId);
    if (!invite) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lời mời.');
    }
    if (invite.acceptedAt !== null) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Lời mời đã được chấp nhận, không thể gửi lại.',
      );
    }
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
    }

    // Replace the old invite with a fresh token (same email + role) — the
    // invite use case generates the new token and sends the email.
    await this.inviteRepo.delete(inviteId, organizationId);
    await this.inviteMemberUseCase.execute({
      organizationId,
      organizationName: organization.name,
      email: invite.email,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
    });
  }
}
