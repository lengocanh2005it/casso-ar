import { ApiProperty } from '@nestjs/swagger';

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
