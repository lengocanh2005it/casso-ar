import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateManualTaskDto {
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
