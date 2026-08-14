import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ReminderExecutionStatus } from '../../domain/reminder-execution';

export class ListReminderExecutionsQueryDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  receivableId?: string;

  @ApiProperty({ enum: ReminderExecutionStatus, required: false })
  @IsOptional()
  @IsEnum(ReminderExecutionStatus)
  status?: ReminderExecutionStatus;

  @ApiProperty({ type: Number, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
