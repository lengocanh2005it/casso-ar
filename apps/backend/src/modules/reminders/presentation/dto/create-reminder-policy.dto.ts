import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { CustomerGroup } from '../../../customers/domain/customer-group';
import { ReminderRuleDto } from './reminder-rule.dto';

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
