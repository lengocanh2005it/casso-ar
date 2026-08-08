import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class ReminderRuleDto {
  @IsInt()
  offsetDays: number;

  @IsString()
  @IsNotEmpty()
  emailTemplateId: string;

  @IsInt()
  @Min(0)
  minIntervalDays: number;
}
