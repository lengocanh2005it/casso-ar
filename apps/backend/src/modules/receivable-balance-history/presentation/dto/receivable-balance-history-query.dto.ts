import { ReceivableStatus } from '@casso-ar/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { BalanceHistoryChangeSource } from '../../domain/balance-history-change-source';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReceivableBalanceHistoryQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    format: 'uuid',
    description: 'Filter by receivable id',
  })
  @IsOptional()
  @IsUUID()
  receivableId?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: '2026-08-01',
    description: 'Inclusive start local date in Asia/Ho_Chi_Minh (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(LOCAL_DATE_PATTERN, {
    message: 'from must be a local date in YYYY-MM-DD format',
  })
  from?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: '2026-08-31',
    description: 'Inclusive end local date in Asia/Ho_Chi_Minh (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(LOCAL_DATE_PATTERN, {
    message: 'to must be a local date in YYYY-MM-DD format',
  })
  to?: string;

  @ApiProperty({
    required: false,
    enum: ReceivableStatus,
    description: 'Filter by receivable status at snapshot time',
  })
  @IsOptional()
  @IsEnum(ReceivableStatus)
  status?: ReceivableStatus;

  @ApiProperty({
    required: false,
    enum: BalanceHistoryChangeSource,
    description: 'Filter by transition change source',
  })
  @IsOptional()
  @IsEnum(BalanceHistoryChangeSource)
  changeSource?: BalanceHistoryChangeSource;

  @ApiProperty({ required: false, type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    required: false,
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
