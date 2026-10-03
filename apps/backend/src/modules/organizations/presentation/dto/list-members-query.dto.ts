import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import type { MembershipStatus } from '../../domain/membership';

export class ListMembersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'BLOCKED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED'])
  status?: MembershipStatus;
}
