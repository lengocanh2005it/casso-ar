import { ApiProperty } from '@nestjs/swagger';
import type {
  MembershipStatus,
  Role,
} from '../../../organizations/domain/membership';

export class AdminOrganizationItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['ACTIVE', 'LOCKED'] })
  status: 'ACTIVE' | 'LOCKED';

  @ApiProperty()
  createdAt: Date;
}

export class AdminOrganizationsResponseDto {
  @ApiProperty({ type: [AdminOrganizationItemResponseDto] })
  items: AdminOrganizationItemResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class AdminOrganizationStatusResponseDto {
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED'] })
  status: 'ACTIVE' | 'LOCKED';
}

export class AdminAiUsageItemResponseDto {
  @ApiProperty()
  organizationId: string;

  @ApiProperty()
  organizationName: string;

  @ApiProperty()
  model: string;

  @ApiProperty()
  requestCount: number;

  @ApiProperty()
  totalTokens: number;

  @ApiProperty()
  errorCount: number;
}

export class AdminAiUsageResponseDto {
  @ApiProperty({ type: [AdminAiUsageItemResponseDto] })
  items: AdminAiUsageItemResponseDto[];
}

export class AdminAiUsageTrendItemResponseDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  requestCount: number;

  @ApiProperty()
  totalTokens: number;
}

export class AdminAiUsageTrendResponseDto {
  @ApiProperty({ type: [AdminAiUsageTrendItemResponseDto] })
  items: AdminAiUsageTrendItemResponseDto[];
}

export class AdminMemberItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    enum: ['OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SALES_REP', 'VIEWER'],
  })
  role: Role;

  @ApiProperty({ type: Date, nullable: true })
  joinedAt: Date | null;

  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] })
  status: MembershipStatus;

  @ApiProperty({ type: Date, nullable: true })
  blockedAt: Date | null;
}

export class AdminPendingInviteItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    enum: ['OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SALES_REP', 'VIEWER'],
  })
  role: Role;

  @ApiProperty()
  invitedAt: Date;

  @ApiProperty()
  expiresAt: Date;
}

export class AdminMembersPageResponseDto {
  @ApiProperty({ type: [AdminMemberItemResponseDto] })
  items: AdminMemberItemResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class AdminPendingInvitesPageResponseDto {
  @ApiProperty({ type: [AdminPendingInviteItemResponseDto] })
  items: AdminPendingInviteItemResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class AdminMembersResponseDto {
  @ApiProperty({ type: AdminMembersPageResponseDto })
  members: AdminMembersPageResponseDto;

  @ApiProperty({ type: AdminPendingInvitesPageResponseDto })
  pendingInvites: AdminPendingInvitesPageResponseDto;
}
