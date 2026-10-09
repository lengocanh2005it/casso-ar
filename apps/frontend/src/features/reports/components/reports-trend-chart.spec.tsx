import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  formatTrendMonthLabel,
  ReportsTrendChart,
} from './reports-trend-chart';

let chartData: Array<{
  outstanding: string | null;
  collected: string;
  outstandingPercent: number | null;
  collectedPercent: number;
}> = [];
let tooltipFormatter:
  | ((
      value: number,
      name: string,
      item: { dataKey: string; payload: (typeof chartData)[number] },
    ) => unknown)
  | undefined;

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    LineChart: ({
      data,
      children,
    }: {
      data: typeof chartData;
      children: ReactNode;
    }) => {
      chartData = data;
      return <>{children}</>;
    },
    Tooltip: ({ formatter }: { formatter: typeof tooltipFormatter }) => {
      tooltipFormatter = formatter;
      return null;
    },
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: () => null,
  };
});

describe('ReportsTrendChart', () => {
  it('plots percentages while tooltips read original large strings', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            {
              month: '2026-07',
              outstanding: '9007199254740992',
              collected: '0',
            },
            {
              month: '2026-08',
              outstanding: '9007199254740993',
              collected: '12345678901234567890',
            },
          ],
        }}
      />,
    );
    expect(chartData[1].collectedPercent).toBe(100);
    expect(chartData[1].collected).toBe('12345678901234567890');
    expect(
      tooltipFormatter?.(100, 'Đã thu', {
        dataKey: 'collectedPercent',
        payload: chartData[1],
      }),
    ).toBe('12.345.678.901.234.567.890 ₫');
  });
  it('keeps exact large values in the screen-reader table', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            {
              month: '2026-07',
              outstanding: '9007199254740993',
              collected: '12345678901234567890',
            },
          ],
        }}
      />,
    );
    const row = screen.getByRole('row', { name: /7\/2026/ });
    expect(row).toHaveTextContent('9.007.199.254.740.993 ₫');
    expect(row).toHaveTextContent('12.345.678.901.234.567.890 ₫');
  });
  it('labels the current month as a temporary value on the chart', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-06', outstanding: null, collected: '0' },
            { month: '2026-07', outstanding: '4000000', collected: '3000000' },
            { month: '2026-08', outstanding: '7000000', collected: '5000000' },
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
            { month: '2026-07', outstanding: '4000000', collected: '3000000' },
            { month: '2026-08', outstanding: '7000000', collected: '5000000' },
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
            { month: '2026-07', outstanding: '4000000', collected: '3000000' },
            { month: '2026-08', outstanding: '7000000', collected: '5000000' },
          ],
        }}
      />,
    );

    const legend = screen.getByRole('list', { name: 'Chú giải biểu đồ' });
    expect(legend).toHaveTextContent('Công nợ còn lại');
    expect(legend).toHaveTextContent('Đã thu');
  });

  it('provides exact chart values in a screen-reader table', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-07', outstanding: '4000000', collected: '3000000' },
            { month: '2026-08', outstanding: null, collected: '5000000' },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('table', {
        name: 'Giá trị biểu đồ xu hướng công nợ và thu hồi',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /7\/2026/ })).toHaveTextContent(
      '4.000.000 ₫',
    );
    expect(screen.getByRole('row', { name: /8\/2026/ })).toHaveTextContent(
      'Chưa có dữ liệu',
    );
  });

  it('shows an empty state instead of bare axes when every month is zero', () => {
    render(
      <ReportsTrendChart
        trend={{
          months: 3,
          items: [
            { month: '2026-07', outstanding: null, collected: '0' },
            { month: '2026-08', outstanding: '0', collected: '0' },
          ],
        }}
      />,
    );

    expect(screen.getByText('Chưa có dữ liệu xu hướng')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
