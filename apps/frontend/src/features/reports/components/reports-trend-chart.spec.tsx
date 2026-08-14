import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  formatTrendMonthLabel,
  ReportsTrendChart,
} from './reports-trend-chart';

describe('ReportsTrendChart', () => {
  it('labels the current month as a temporary value on the chart', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-06', outstanding: null, collected: 0 },
            { month: '2026-07', outstanding: 4_000_000, collected: 3_000_000 },
            { month: '2026-08', outstanding: 7_000_000, collected: 5_000_000 },
          ],
        }}
      />,
    );

    expect(formatTrendMonthLabel('2026-08', true)).toBe(
      'Tháng 8/2026 (tạm tính)',
    );
    expect(screen.getByRole('img')).toBeTruthy();
  });
});
