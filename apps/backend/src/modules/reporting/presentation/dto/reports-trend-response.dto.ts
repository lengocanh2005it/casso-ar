import { ApiProperty } from '@nestjs/swagger';
import type { TrendMonths } from '../../application/trend-report.repository.port';

export class ReportsTrendPointResponseDto {
  @ApiProperty({ example: '2026-06' })
  month: string;

  @ApiProperty({ type: String, nullable: true })
  outstanding: string | null;

  @ApiProperty({ type: String })
  collected: string;
}

export class ReportsTrendResponseDto {
  @ApiProperty({ enum: [3, 6, 12] })
  months: TrendMonths;

  @ApiProperty({ type: [ReportsTrendPointResponseDto] })
  items: ReportsTrendPointResponseDto[];
}
