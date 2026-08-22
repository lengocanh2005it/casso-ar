import { describe, expect, it } from 'vitest';
import { formatAgingBucketTick } from './aging-chart';

describe('formatAgingBucketTick', () => {
  it('translates raw aging bucket codes to Vietnamese labels', () => {
    expect(formatAgingBucketTick('NOT_DUE')).toBe('Chưa đến hạn');
    expect(formatAgingBucketTick('OVERDUE_60_PLUS')).toBe(
      'Quá hạn trên 60 ngày',
    );
  });
});
