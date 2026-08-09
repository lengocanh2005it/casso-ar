import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { CustomerGroup } from '../../../customers/domain/customer-group';
import { ReminderRuleDto } from './reminder-rule.dto';

export class CreateReminderPolicyDto {
  @IsEnum(CustomerGroup)
  customerGroup: CustomerGroup;

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
