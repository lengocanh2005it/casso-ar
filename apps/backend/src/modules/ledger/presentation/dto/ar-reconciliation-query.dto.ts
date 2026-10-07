import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ArReconciliationQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Continuation cursor returned by the previous page',
    example: 'RECEIVABLE:10000000-0000-4000-8000-000000000001',
  })
  @IsOptional()
  @IsString()
  @Matches(
    /^(RECEIVABLE|PAYMENT):[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  )
  cursor?: string;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Maximum number of subjects to check on this page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
