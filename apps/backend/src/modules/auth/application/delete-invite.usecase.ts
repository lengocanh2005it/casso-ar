import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';

@Injectable()
export class DeleteInviteUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
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
        'Lời mời đã được chấp nhận, không thể thu hồi.',
      );
    }
    await this.inviteRepo.delete(inviteId, organizationId);
  }
}
