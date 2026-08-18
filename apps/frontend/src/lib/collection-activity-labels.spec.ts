import { describe, expect, it } from 'vitest';
import { formatActivityType } from './collection-activity-labels';

describe('formatActivityType', () => {
  it('translates known activity type codes to Vietnamese labels', () => {
    expect(formatActivityType('PAYMENT_RECEIVED')).toBe('Nhận thanh toán');
    expect(formatActivityType('RECEIVABLE_CLOSED')).toBe('Đã đóng công nợ');
  });

  it('falls back to the raw code for an unknown activity type', () => {
    expect(formatActivityType('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});
