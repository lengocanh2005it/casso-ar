import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { MembershipInvite } from '../domain/membership-invite';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';

export interface ListInvitesInput {
  page: number;
  limit: number;
}

export interface ListInvitesOutput {
  items: MembershipInvite[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListInvitesUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ListInvitesInput): Promise<ListInvitesOutput> {
    const organizationId = this.tenantContext.getOrganizationId();
    const [items, total] = await Promise.all([
      this.inviteRepo.findPendingPageByOrganization(
        organizationId,
        input.page,
        input.limit,
      ),
      this.inviteRepo.countPendingByOrganization(organizationId),
    ]);
    return { items, total, page: input.page, limit: input.limit };
  }
}
