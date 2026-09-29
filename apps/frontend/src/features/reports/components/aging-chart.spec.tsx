import { render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AgingReport } from '../types';
import {
  AgingChart,
  formatAgingBucketShortTick,
  formatAgingBucketTick,
} from './aging-chart';

const xAxisProps: Array<Record<string, unknown>> = [];
const cellFills: string[] = [];

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
    Bar: ({ children }: { children: ReactNode }) => <>{children}</>,
    Cell: ({ fill }: { fill: string }) => {
      cellFills.push(fill);
      return null;
    },
  };
});

function report(amounts: number[]): AgingReport {
  const buckets = [
    'NOT_DUE',
    'OVERDUE_1_7',
    'OVERDUE_8_30',
    'OVERDUE_31_60',
    'OVERDUE_60_PLUS',
  ] as const;
  return {
    buckets: buckets.map((bucket, i) => ({
      bucket,
      count: amounts[i] > 0 ? 1 : 0,
      totalRemaining: amounts[i],
    })),
  };
}

describe('formatAgingBucketTick', () => {
  it('translates raw aging bucket codes to Vietnamese labels', () => {
    expect(formatAgingBucketTick('NOT_DUE')).toBe('Chưa đến hạn');
    expect(formatAgingBucketTick('OVERDUE_60_PLUS')).toBe(
      'Quá hạn trên 60 ngày',
    );
  });
});

describe('AgingChart', () => {
  it('uses short tick labels so all five buckets fit and none are skipped', () => {
    xAxisProps.length = 0;
    render(<AgingChart report={report([5, 4, 3, 2, 1])} />);

    expect(formatAgingBucketShortTick('OVERDUE_1_7')).toBe('1–7 ngày');
    expect(formatAgingBucketShortTick('OVERDUE_60_PLUS')).toBe('> 60 ngày');
    expect(xAxisProps.at(-1)).toMatchObject({
      interval: 0,
      tickFormatter: formatAgingBucketShortTick,
    });
  });

  it('colours bars by overdue severity like the customer aging table', () => {
    cellFills.length = 0;
    render(<AgingChart report={report([5, 4, 3, 2, 1])} />);

    expect(cellFills).toEqual([
      'var(--chart-1)',
      'var(--warning)',
      'var(--warning)',
      'var(--destructive)',
      'var(--destructive)',
    ]);
  });

  it('shows an empty state instead of a 0–4 axis when nothing is outstanding', () => {
    render(<AgingChart report={report([0, 0, 0, 0, 0])} />);

    expect(
      screen.getByText('Chưa có công nợ để phân tích'),
    ).toBeInTheDocument();
  });
});
