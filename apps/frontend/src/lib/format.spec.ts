import { describe, expect, it } from 'vitest';
import { formatDate, formatVND } from './format';

describe('format helpers', () => {
  it('formats integer VND amounts for Vietnamese users', () => {
    expect(formatVND(50_000_000)).toBe('50.000.000\u00A0₫');
  });

  it('formats an ISO date for Vietnamese users', () => {
    expect(formatDate('2026-08-20T00:00:00.000Z')).toBe('20/08/2026');
  });
});
