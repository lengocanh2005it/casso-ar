import { Inject, Injectable } from '@nestjs/common';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from '../../auth/application/membership-invite-repository.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
  type MembershipListFilters,
} from '../../organizations/application/membership-repository.port';
import type {
  MembershipStatus,
  Role,
} from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import type { AdminMemberStatusFilter } from './admin-member-status-filter';

export interface ListOrganizationMembersInput {
  organizationId: string;
  page: number;
  limit: number;
  status: AdminMemberStatusFilter;
  search?: string;
}

export interface AdminMemberItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date | null;
  status: MembershipStatus;
  blockedAt: Date | null;
}

export interface AdminPendingInviteItem {
  id: string;
  email: string;
  role: Role;
  invitedAt: Date;
  expiresAt: Date;
}

export interface AdminMembersPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ListOrganizationMembersResult {
  members: AdminMembersPage<AdminMemberItem>;
  pendingInvites: AdminMembersPage<AdminPendingInviteItem>;
}

@Injectable()
export class ListOrganizationMembersUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(
    input: ListOrganizationMembersInput,
  ): Promise<ListOrganizationMembersResult> {
    const search = input.search?.trim() || undefined;
    const { organizationId, page, limit, status } = input;

    const readMembers =
      status === 'ALL' || status === 'ACTIVE' || status === 'BLOCKED';
    const readInvites = status === 'ALL' || status === 'PENDING';

    let userIds: string[] | undefined;
    if (search && readMembers) {
      userIds = await this.membershipRepo.findUserIdsByOrganizationSearch(
        organizationId,
        search,
      );
    }

    const memberFilters: MembershipListFilters | undefined =
      readMembers &&
      (userIds !== undefined || status === 'ACTIVE' || status === 'BLOCKED')
        ? {
            ...(status === 'ACTIVE' || status === 'BLOCKED' ? { status } : {}),
            ...(userIds !== undefined ? { userIds } : {}),
          }
        : undefined;

    // A search that matched no user short-circuits the member reads; the
    // invite reads still run because pending invites match by email.
    const membersMatch = readMembers && !(userIds && userIds.length === 0);
    const [membershipRows, memberTotal] = membersMatch
      ? await Promise.all([
          this.membershipRepo.findPageByOrganization(
            organizationId,
            page,
            limit,
            memberFilters,
          ),
          this.membershipRepo.countByOrganization(
            organizationId,
            memberFilters,
          ),
        ])
      : [[], 0];

    const [inviteRows, inviteTotal] = readInvites
      ? await Promise.all([
          this.inviteRepo.findPendingPageByOrganization(
            organizationId,
            page,
            limit,
            search,
          ),
          this.inviteRepo.countPendingByOrganization(organizationId, search),
        ])
      : [[], 0];

    const users =
      membershipRows.length > 0
        ? await this.userRepo.findByIds(membershipRows.map((m) => m.userId))
        : new Map();

    // Orphaned membership (user deleted) — excluded from results.
    const members: AdminMembersPage<AdminMemberItem> = {
      items: membershipRows.flatMap((membership) => {
        const user = users.get(membership.userId);
        return user
          ? [
              {
                id: membership.id,
                userId: membership.userId,
                name: user.name,
                email: user.email,
                role: membership.role,
                joinedAt: membership.joinedAt,
                status: membership.status,
                blockedAt: membership.blockedAt,
              },
            ]
          : [];
      }),
      total: memberTotal,
      page,
      limit,
    };

    const pendingInvites: AdminMembersPage<AdminPendingInviteItem> = {
      items: inviteRows.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        invitedAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      })),
      total: inviteTotal,
      page,
      limit,
    };

    return { members, pendingInvites };
  }
}
