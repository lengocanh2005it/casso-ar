import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_SEARCH_LENGTH } from '../../../../common/validation/search-length';

export class ListReceivablesQueryDto {
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
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  salesRepresentativeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}
