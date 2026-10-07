import { render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportsTrend } from '@/features/reports/types';
import { PaymentActivityChart } from './payment-activity-chart';
import { ReceivableTrendChart } from './receivable-trend-chart';

const xAxisProps: Array<Record<string, unknown>> = [];

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    // jsdom has no layout: hand the chart a fixed size so it renders axes.
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(
        children as ReactElement<{ width: number; height: number }>,
        {
          width: 600,
          height: 300,
        },
      ),
    XAxis: (props: Record<string, unknown>) => {
      xAxisProps.push(props);
      return null;
    },
  };
});

const months = [
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
];

function trend(
  outstanding: Array<number | null>,
  collected: number[],
): ReportsTrend {
  return {
    months: 6,
    items: months.map((month, i) => ({
      month,
      outstanding: outstanding[i],
      collected: collected[i],
    })),
  };
}

describe('ReceivableTrendChart', () => {
  it('shows an empty state instead of bare axes when no month has a balance', () => {
    render(
      <ReceivableTrendChart
        trend={trend([null, null, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])}
      />,
    );

    expect(screen.getByText('Chưa có dữ liệu xu hướng')).toBeInTheDocument();
  });

  it('lets the month axis drop labels that would overlap on narrow screens', () => {
    xAxisProps.length = 0;
    render(
      <ReceivableTrendChart
        trend={trend([1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 0])}
      />,
    );

    // interval={0} forced all 6–12 "Tháng M/YYYY" labels into a 300px axis.
    expect(xAxisProps.at(-1)?.interval).toBe('preserveStartEnd');
  });
});

describe('PaymentActivityChart', () => {
  it('shows an empty state instead of bare axes when nothing was collected', () => {
    render(
      <PaymentActivityChart
        trend={trend([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0])}
      />,
    );

    expect(screen.getByText('Chưa có khoản thu nào')).toBeInTheDocument();
  });

  it('keeps a visible provisional note for the latest collection month', () => {
    render(
      <PaymentActivityChart
        trend={trend([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1])}
      />,
    );

    expect(
      screen.getByText(/là tháng hiện tại nên số liệu là tạm tính/i),
    ).toBeInTheDocument();
  });
});
