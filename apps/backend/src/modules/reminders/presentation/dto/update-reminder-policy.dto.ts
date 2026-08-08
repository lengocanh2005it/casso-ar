import { Type } from 'class-transformer';
import { IsArray, IsBoolean, ValidateNested } from 'class-validator';
import { ReminderRuleDto } from './reminder-rule.dto';

export class UpdateReminderPolicyDto {
  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  rules: ReminderRuleDto[];
}
