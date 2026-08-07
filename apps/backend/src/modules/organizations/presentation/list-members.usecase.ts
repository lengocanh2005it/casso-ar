import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../application/membership-repository.port';
import type { MemberResponseDto } from './dto/member-response.dto';
import { toMemberResponse } from './dto/member-response.dto';

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

    const items = memberships.map((m) =>
      toMemberResponse(m, {
        email: (m as any).user?.email ?? '',
        name: (m as any).user?.name ?? '',
      }),
    );

    return { items, total, page, limit };
  }
}
