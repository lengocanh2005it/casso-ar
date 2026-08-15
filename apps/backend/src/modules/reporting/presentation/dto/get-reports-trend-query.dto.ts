import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import type { TrendMonths } from '../../application/trend-report.repository.port';

const TREND_MONTHS = [3, 6, 12] as const;

export class GetReportsTrendQueryDto {
  @IsOptional()
  @ApiProperty({ type: Number, enum: [3, 6, 12], default: 3 })
  @Type(() => Number)
  @IsIn(TREND_MONTHS)
  months?: TrendMonths;
}
