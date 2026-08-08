import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReminderExecutionStatus } from '../../domain/reminder-execution';

export class ListReminderExecutionsQuery {
  @IsOptional()
  receivableId?: string;

  @IsOptional()
  @IsEnum(ReminderExecutionStatus)
  status?: ReminderExecutionStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
