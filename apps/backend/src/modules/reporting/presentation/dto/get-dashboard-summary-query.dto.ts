import {
  IsDateString,
  IsOptional,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_RANGE_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;

interface DashboardDateRangeInput {
  from?: unknown;
  to?: unknown;
}

@ValidatorConstraint({ name: 'dashboardDateRange', async: false })
class DashboardDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { from, to } = args.object as DashboardDateRangeInput;
    if (typeof from !== 'string' || typeof to !== 'string') {
      return true;
    }

    const fromTime = Date.parse(from);
    const toTime = Date.parse(to);
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
      return true;
    }

    const range = toTime - fromTime;
    return range >= 0 && range <= MAX_RANGE_MILLISECONDS;
  }

  defaultMessage(): string {
    return 'Khoảng thời gian phải có from <= to và không vượt quá 90 ngày.';
  }
}

export class GetDashboardSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  @Validate(DashboardDateRangeConstraint)
  to?: string;
}
