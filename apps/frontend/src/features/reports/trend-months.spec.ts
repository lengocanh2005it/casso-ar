import { describe, expect, it } from 'vitest';
import { isTrendMonths, parseTrendMonths, TREND_MONTHS } from './trend-months';

describe('trend months', () => {
  it('accepts only the supported presets and falls back per page', () => {
    expect(TREND_MONTHS).toEqual([3, 6, 12]);
    expect(isTrendMonths(3)).toBe(true);
    expect(isTrendMonths(9)).toBe(false);
    expect(parseTrendMonths(null, 6)).toBe(6);
    expect(parseTrendMonths('9', 6)).toBe(6);
    expect(parseTrendMonths('12', 6)).toBe(12);
    expect(parseTrendMonths('invalid', 12)).toBe(12);
  });
});
