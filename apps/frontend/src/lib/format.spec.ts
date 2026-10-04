import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatPlanPrice,
  formatUnavailable,
  formatVND,
  formatVNDCompact,
} from './format';

describe('format helpers', () => {
  it('formats integer VND amounts for Vietnamese users', () => {
    expect(formatVND(50_000_000)).toBe('50.000.000 ₫');
  });

  it('formats an ISO date for Vietnamese users', () => {
    expect(formatDate('2026-08-20T00:00:00.000Z')).toBe('20/08/2026');
  });

  it('formats an ISO timestamp with date and minute precision for Vietnamese users', () => {
    expect(formatDateTime('2026-08-20T07:05:00.000Z')).toBe('14:05 20/08/2026');
  });

  it('abbreviates VND amounts in millions for compact axis labels', () => {
    expect(formatVNDCompact(300_000_000)).toBe('300tr');
    expect(formatVNDCompact(62_600_000)).toBe('62,6tr');
  });

  it('abbreviates VND amounts in billions for compact axis labels', () => {
    expect(formatVNDCompact(1_500_000_000)).toBe('1,5tỷ');
  });

  it('leaves small amounts unabbreviated', () => {
    expect(formatVNDCompact(0)).toBe('0');
    expect(formatVNDCompact(750_000)).toBe('750.000');
  });

  it('renders a free plan price as a word rather than a zero amount', () => {
    expect(formatPlanPrice(0)).toBe('Miễn phí');
  });

  it('renders a paid plan price as its VND amount', () => {
    expect(formatPlanPrice(299_000)).toBe(formatVND(299_000));
  });

  it('marks an unavailable figure instead of showing a zero or a blank', () => {
    expect(formatUnavailable(undefined)).toBe('—');
    expect(formatUnavailable(5_000)).toBe('5.000');
    expect(formatUnavailable(0)).toBe('0');
  });
});
