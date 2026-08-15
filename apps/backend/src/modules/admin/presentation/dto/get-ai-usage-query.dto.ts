import {
  IsDateString,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

@ValidatorConstraint({ name: 'adminAiUsageDateRange', async: false })
class AdminAiUsageDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { from, to } = args.object as { from?: string; to?: string };
    if (typeof from !== 'string' || typeof to !== 'string') return true;
    const fromTime = Date.parse(from);
    const toTime = Date.parse(to);
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return true;
    const range = toTime - fromTime;
    return range >= 0 && range <= MAX_RANGE_MS;
  }

  defaultMessage(): string {
    return 'to phải >= from và khoảng cách không vượt quá 90 ngày.';
  }
}

export class GetAiUsageQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  @Validate(AdminAiUsageDateRangeConstraint)
  to: string;
}
