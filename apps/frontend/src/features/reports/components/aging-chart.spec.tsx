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

    // Two lines per label so all five fit a phone slot — see the last test.
    expect(formatAgingBucketShortTick('OVERDUE_1_7')).toBe('1–7\nngày');
    expect(formatAgingBucketShortTick('OVERDUE_60_PLUS')).toBe('> 60\nngày');
    expect(xAxisProps.at(-1)).toMatchObject({
      interval: 0,
    });
    // The labels are rendered by a tick component, not a formatter string —
    // recharts cannot break a "\n" inside a single <text> node.
    expect(xAxisProps.at(-1)?.tick).toBeTruthy();
    expect(xAxisProps.at(-1)?.tickFormatter).toBeUndefined();
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

  it('keeps every X-axis label inside its own tick slot on a phone', () => {
    xAxisProps.length = 0;
    render(<AgingChart report={report([5, 4, 3, 2, 1])} />);

    // Measured at 390px the five ticks had ~52px of slot each while the
    // labels rendered 48–74px wide, so every neighbouring pair collided:
    // "Chưa đến hạn" (74px) ran 18px into "1–7 ngày" and 63px into
    // "31–60 ngày". The label no longer needs to name the bucket — the
    // coloured bars and the tooltip carry that, and the aging table right
    // next to it spells every bucket out. Two short lines that fit the slot
    // keep all five readable.
    expect(formatAgingBucketShortTick('NOT_DUE')).toBe('Chưa đến\nhạn');
    expect(formatAgingBucketShortTick('OVERDUE_1_7')).toBe('1–7\nngày');
    expect(formatAgingBucketShortTick('OVERDUE_8_30')).toBe('8–30\nngày');
    expect(formatAgingBucketShortTick('OVERDUE_31_60')).toBe('31–60\nngày');
    expect(formatAgingBucketShortTick('OVERDUE_60_PLUS')).toBe('> 60\nngày');

    // Every rendered label must fit the ~52px a 390px viewport gives each of
    // five slots. "Chưa đến" is the widest single word left.
    for (const bucket of [
      'NOT_DUE',
      'OVERDUE_1_7',
      'OVERDUE_8_30',
      'OVERDUE_31_60',
      'OVERDUE_60_PLUS',
    ] as const) {
      for (const line of formatAgingBucketShortTick(bucket).split('\n')) {
        expect(line.length).toBeLessThanOrEqual(9);
      }
    }
  });

  it('renders each tick as real tspans so recharts actually breaks the line', async () => {
    // `tickFormatter` returning a string with "\n" is not enough: recharts
    // writes the value into a single <text> node and SVG collapses the
    // newline to a space. The tick has to be a component that emits one
    // <tspan> per line — the formatter string alone left every label on one
    // line and all four neighbouring pairs still overlapped at 390px.
    xAxisProps.length = 0;
    render(<AgingChart report={report([5, 4, 3, 2, 1])} />);

    const tickElement = xAxisProps.at(-1)?.tick as ReactElement<{
      x?: number;
      y?: number;
      payload?: { value?: string };
    }>;
    const tick = tickElement.type as (props: {
      x?: number;
      y?: number;
      payload?: { value?: string };
    }) => ReactElement;

    const { renderToStaticMarkup } = await import('react-dom/server');
    const markup = renderToStaticMarkup(
      tick({
        x: 0,
        y: 0,
        payload: { value: 'OVERDUE_1_7' },
      }),
    );

    expect(markup).toContain('1–7');
    expect(markup).toContain('ngày');
    expect(markup.match(/<tspan/g) ?? []).toHaveLength(2);
  });
});
