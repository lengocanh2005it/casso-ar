import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import {
  ADMIN_ORGANIZATION_STATUS_FILTERS,
  type AdminOrganizationStatusFilter,
} from '../../application/list-organizations.usecase';

export class AdminOrganizationsQueryDto extends PaginationDto {
  @ApiProperty({
    enum: ADMIN_ORGANIZATION_STATUS_FILTERS,
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(ADMIN_ORGANIZATION_STATUS_FILTERS)
  status: AdminOrganizationStatusFilter = 'ALL';
}
