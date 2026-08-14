import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';
import { AGING_BUCKETS } from '../../application/aging-report.repository.port';

export class GetCustomerAgingQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @IsOptional()
  @IsIn(AGING_BUCKETS)
  bucket?: (typeof AGING_BUCKETS)[number];
}
