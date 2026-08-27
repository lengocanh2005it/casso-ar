import type { TrendMonths } from './types';

export const TREND_MONTHS: TrendMonths[] = [3, 6, 12];

export function isTrendMonths(value: number): value is TrendMonths {
  return TREND_MONTHS.some((months) => months === value);
}

export function parseTrendMonths(
  value: string | null,
  fallback: TrendMonths,
): TrendMonths {
  const parsed = Number(value ?? fallback);
  return isTrendMonths(parsed) ? parsed : fallback;
}
