import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import {
  ADMIN_MEMBER_STATUS_FILTERS,
  type AdminMemberStatusFilter,
} from '../../application/admin-member-status-filter';

export class AdminMembersQueryDto extends PaginationDto {
  @ApiProperty({
    enum: ['ALL', 'ACTIVE', 'BLOCKED', 'PENDING'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(ADMIN_MEMBER_STATUS_FILTERS)
  status: AdminMemberStatusFilter = 'ALL';

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}
