import {
  IsDateString,
  Validate,
  ValidateIf,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_RANGE_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;

interface DashboardDateRangeInput {
  from?: unknown;
  to?: unknown;
}

function eitherDatePresent(dto: DashboardDateRangeInput): boolean {
  return dto.from !== undefined || dto.to !== undefined;
}

@ValidatorConstraint({ name: 'dashboardDateRange', async: false })
class DashboardDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { from, to } = args.object as DashboardDateRangeInput;
    const fromPresent = typeof from === 'string';
    const toPresent = typeof to === 'string';

    if (fromPresent !== toPresent) {
      return false;
    }
    if (!fromPresent || !toPresent) {
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
    return 'from và to phải đi cùng nhau, có from <= to, và không vượt quá 90 ngày.';
  }
}

export class GetDashboardSummaryQueryDto {
  @ValidateIf(eitherDatePresent)
  @IsDateString()
  from?: string;

  @ValidateIf(eitherDatePresent)
  @IsDateString()
  @Validate(DashboardDateRangeConstraint)
  to?: string;
}
