import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import { AGING_BUCKETS } from '../../application/aging-report.repository.port';

export class GetCustomerAgingQueryDto extends PaginationDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @ApiProperty({ enum: AGING_BUCKETS, required: false })
  @IsOptional()
  @IsIn(AGING_BUCKETS)
  bucket?: (typeof AGING_BUCKETS)[number];
}
