import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../domain/membership';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from './membership-repository.port';

export interface ChangeMemberRoleInput {
  userId: string;
  role: Role;
}

@Injectable()
export class ChangeMemberRoleUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ChangeMemberRoleInput) {
    const organizationId = this.tenantContext.getOrganizationId();
    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.userId,
      organizationId,
    );
    if (!membership) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy thành viên trong tổ chức.',
      );
    }
    if (!membership.isActive()) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Thành viên chưa tham gia tổ chức, không thể đổi vai trò.',
      );
    }
    if (membership.role === Role.OWNER && input.role !== Role.OWNER) {
      const ownerCount = await this.membershipRepo.countActiveByRole(
        organizationId,
        Role.OWNER,
      );
      if (ownerCount <= 1) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Không thể hạ quyền OWNER cuối cùng của tổ chức.',
        );
      }
    }

    const updated = membership.withRole(input.role);
    await this.membershipRepo.save(updated);
    return updated;
  }
}
