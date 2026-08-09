import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { ReminderRuleDto } from './reminder-rule.dto';

export class UpdateReminderPolicyDto {
  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsInt()
  @IsPositive()
  escalationThresholdDays?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  rules: ReminderRuleDto[];
}
