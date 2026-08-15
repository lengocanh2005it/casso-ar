import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

export const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_DAYS = 30;

export interface ReceivableBalanceHistoryDateFilterInput {
  from?: string;
  to?: string;
}

export function localDateToInstant(
  localDate: string,
  exclusiveEnd: boolean,
): Date {
  const localDateAtNoon = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(localDateAtNoon.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Ngày không hợp lệ');
  }
  if (exclusiveEnd) {
    localDateAtNoon.setUTCDate(localDateAtNoon.getUTCDate() + 1);
  }
  const datePart = exclusiveEnd
    ? formatInTimeZone(localDateAtNoon, 'UTC', 'yyyy-MM-dd')
    : localDate;
  const instant = fromZonedTime(`${datePart}T00:00:00`, REPORTING_TIMEZONE);
  if (Number.isNaN(instant.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Ngày không hợp lệ');
  }
  return instant;
}

export function resolveDateFilters(
  input: ReceivableBalanceHistoryDateFilterInput,
): { from: Date; to: Date } | { from?: Date; to?: Date } {
  const from = input.from ? localDateToInstant(input.from, false) : undefined;
  const to = input.to ? localDateToInstant(input.to, true) : undefined;
  if (from || to) return { from, to };

  const today = formatInTimeZone(new Date(), REPORTING_TIMEZONE, 'yyyy-MM-dd');
  const fromDate = new Date(`${today}T12:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (DEFAULT_DAYS - 1));
  return {
    from: localDateToInstant(
      formatInTimeZone(fromDate, REPORTING_TIMEZONE, 'yyyy-MM-dd'),
      false,
    ),
    to: localDateToInstant(today, true),
  };
}
