import { ApiProperty } from '@nestjs/swagger';
import type { TrendMonths } from '../../application/trend-report.repository.port';

export class ReportsTrendPointResponseDto {
  @ApiProperty({ example: '2026-06' })
  month: string;

  @ApiProperty({ type: Number, nullable: true })
  outstanding: number | null;

  @ApiProperty({ type: Number })
  collected: number;
}

export class ReportsTrendResponseDto {
  @ApiProperty({ enum: [3, 6, 12] })
  months: TrendMonths;

  @ApiProperty({ type: [ReportsTrendPointResponseDto] })
  items: ReportsTrendPointResponseDto[];
}
