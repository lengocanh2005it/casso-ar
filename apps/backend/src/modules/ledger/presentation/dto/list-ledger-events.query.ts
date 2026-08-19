import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LedgerEventKind } from '../../domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../../domain/ledger-event-subject-type';

export class ListLedgerEventsQueryDto {
  @ApiProperty({
    enum: LedgerEventSubjectType,
    description: 'Subject type to query',
  })
  @IsEnum(LedgerEventSubjectType)
  subjectType: LedgerEventSubjectType;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Subject ID (receivable or payment)',
  })
  @IsString()
  subjectId: string;

  @ApiProperty({
    required: false,
    enum: LedgerEventKind,
    description: 'Filter by event kind',
  })
  @IsOptional()
  @IsEnum(LedgerEventKind)
  kind?: LedgerEventKind;

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
