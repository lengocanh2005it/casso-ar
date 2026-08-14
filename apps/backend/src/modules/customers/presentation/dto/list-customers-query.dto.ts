import { ApiProperty } from '@nestjs/swagger';
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

export class ListCustomersQueryDto {
  @ApiProperty({ type: Number, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiProperty({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}
