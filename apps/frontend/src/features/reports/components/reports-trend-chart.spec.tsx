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

    // The tooltip has the width for the long form, so it keeps the note.
    expect(formatTrendMonthLabel('2026-08', true)).toBe(
      'Tháng 8/2026 (tạm tính)',
    );
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('keeps the temporary-month note off the X axis and out of the tick slot', () => {
    // Measured at 390px the tick "Tháng 10/2026 (tạm tính)" rendered 140px
    // into a ~139px slot, so it ran into its neighbour. The note still has
    // to reach the reader, so it moves to the chart's caption instead of
    // eating the axis.
    // The X axis calls the formatter without `isCurrent`, so the tick is just
    // the month — the "(tạm tính)" suffix moves to the caption and tooltip.
    expect(formatTrendMonthLabel('2026-08')).toBe('8/2026');
    expect(formatTrendMonthLabel('2026-08').length).toBeLessThanOrEqual(8);
    expect(formatTrendMonthLabel('2026-08')).not.toContain('tạm tính');
  });

  it('explains the temporary month in the caption rather than on the axis', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-07', outstanding: 4_000_000, collected: 3_000_000 },
            { month: '2026-08', outstanding: 7_000_000, collected: 5_000_000 },
          ],
        }}
      />,
    );

    // The reader still learns that the last month is provisional — just
    // from a sentence under the chart instead of a cramped axis tick.
    expect(
      screen.getByText(/là tháng hiện tại nên số liệu là tạm tính/i),
    ).toBeInTheDocument();
  });

  it('names both lines in a legend', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-07', outstanding: 4_000_000, collected: 3_000_000 },
            { month: '2026-08', outstanding: 7_000_000, collected: 5_000_000 },
          ],
        }}
      />,
    );

    const legend = screen.getByRole('list', { name: 'Chú giải biểu đồ' });
    expect(legend).toHaveTextContent('Công nợ còn lại');
    expect(legend).toHaveTextContent('Đã thu');
  });

  it('shows an empty state instead of bare axes when every month is zero', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-07', outstanding: null, collected: 0 },
            { month: '2026-08', outstanding: 0, collected: 0 },
          ],
        }}
      />,
    );

    expect(screen.getByText('Chưa có dữ liệu xu hướng')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
