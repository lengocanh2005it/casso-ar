import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';

export interface RemoveMemberInput {
  userId: string;
}

@Injectable()
export class RemoveMemberUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: RemoveMemberInput): Promise<void> {
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
    if (membership.role === Role.OWNER) {
      const ownerCount = await this.membershipRepo.countActiveByRole(
        organizationId,
        Role.OWNER,
      );
      if (ownerCount <= 1) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Không thể gỡ OWNER cuối cùng của tổ chức.',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.deleteByUserAndOrganization(
        input.userId,
        organizationId,
        manager,
      );
      await this.refreshTokenRepo.revokeAllForUser(input.userId, manager);
    });
  }
}
