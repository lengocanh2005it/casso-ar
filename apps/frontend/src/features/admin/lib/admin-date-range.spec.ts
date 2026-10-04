import { describe, expect, it } from 'vitest';
import { last7DayRange } from './admin-date-range';

describe('last7DayRange', () => {
  it('spans exactly seven calendar days, inclusive', () => {
    // The backend reads `from` as the start of its day and `to` through
    // end-of-day, so both ends count. Subtracting seven days produced eight
    // distinct dates while the charts said "7 ngày".
    const range = last7DayRange(new Date(2026, 9, 4, 15, 30));

    expect(range).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it('keeps the range on calendar days instead of drifting by timezone', () => {
    // 07:30 local is 00:30 UTC the same day, but 23:30 local is already the
    // next UTC day — toISOString() would report tomorrow as "today".
    const range = last7DayRange(new Date(2026, 9, 4, 23, 30));

    expect(range.to).toBe('2026-10-04');
    expect(range.from).toBe('2026-09-28');
  });
});
