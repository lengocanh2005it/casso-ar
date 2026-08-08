import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';

class ReminderRuleDto {
  @IsInt()
  offsetDays: number;

  @IsNotEmpty()
  emailTemplateId: string;

  @IsInt()
  minIntervalDays: number;
}

export class UpdateReminderPolicyDto {
  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  rules: ReminderRuleDto[];
}
