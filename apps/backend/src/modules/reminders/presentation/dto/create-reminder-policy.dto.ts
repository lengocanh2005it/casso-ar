import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { CustomerGroup } from '../../../customers/domain/customer-group';

class ReminderRuleDto {
  @IsInt()
  offsetDays: number;

  @IsNotEmpty()
  emailTemplateId: string;

  @IsInt()
  minIntervalDays: number;
}

export class CreateReminderPolicyDto {
  @IsEnum(CustomerGroup)
  customerGroup: CustomerGroup;

  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  rules: ReminderRuleDto[];
}
