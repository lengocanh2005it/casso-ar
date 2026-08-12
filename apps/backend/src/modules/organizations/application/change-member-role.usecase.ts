import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../domain/membership';
import { assertNotLastOwner } from './assert-not-last-owner';
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
    private readonly dataSource: DataSource,
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

    return this.dataSource.transaction(async (manager) => {
      if (membership.role === Role.OWNER && input.role !== Role.OWNER) {
        await assertNotLastOwner(
          this.membershipRepo,
          organizationId,
          membership,
        );
      }
      const updated = membership.withRole(input.role);
      await this.membershipRepo.save(updated, manager);
      return updated;
    });
  }
}
