import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import type { MemberResponseDto } from '../presentation/dto/member-response.dto';
import { toMemberResponse } from '../presentation/dto/member-response.dto';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from './membership-repository.port';

export interface ListMembersInput {
  organizationId: string;
  page: number;
  limit: number;
}

export interface ListMembersOutput {
  items: MemberResponseDto[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListMembersUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ListMembersInput): Promise<ListMembersOutput> {
    const currentOrgId = this.tenantContext.getOrganizationId();
    if (input.organizationId !== currentOrgId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Access denied to this organization',
      );
    }

    const { organizationId, page, limit } = input;

    const [memberships, total] = await Promise.all([
      this.membershipRepo.findPageByOrganization(organizationId, page, limit),
      this.membershipRepo.countByOrganization(organizationId),
    ]);

    const userIds = memberships.map((m) => m.userId);
    const users = await this.userRepo.findByIds(userIds);

    const items = memberships.map((m) =>
      toMemberResponse(m, {
        email: users.get(m.userId)?.email ?? '',
        name: users.get(m.userId)?.name ?? '',
      }),
    );

    return { items, total, page, limit };
  }
}
