import { ApiProperty } from '@nestjs/swagger';
import type { MembershipStatus } from '../../modules/organizations/domain/membership';

export class MemberStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] })
  status: MembershipStatus;

  @ApiProperty({ type: Date, nullable: true })
  blockedAt: Date | null;
}
