import { CalendarClock } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/layout/empty-state';
import { CHART_TICK, CHART_TOOLTIP_STYLE, hasChartValue } from '@/lib/chart';
import { formatVND, formatVNDCompact } from '@/lib/format';
import type { AgingBucket, AgingReport } from '../types';
import { AGING_BUCKET_LABELS } from './customer-aging-filters';

// Axis ticks: the full "Quá hạn 8–30 ngày" labels did not fit five across,
// so recharts silently skipped every other one. The tooltip keeps the long form.
//
// The shorter labels then still collided on a phone. Measured at 390px the
// five slots were ~52px wide while these labels rendered 48–74px, so every
// neighbouring pair overlapped — "Chưa đến hạn" ran 18px into "1–7 ngày" and
// 63px into "31–60 ngày". Splitting each into two short lines keeps all five
// inside their own slot; the bucket is still spelled out in full by the
// tooltip and by the aging table beside the chart.
const AGING_BUCKET_SHORT_LABELS: Record<AgingBucket, string> = {
  NOT_DUE: 'Chưa đến\nhạn',
  OVERDUE_1_7: '1–7\nngày',
  OVERDUE_8_30: '8–30\nngày',
  OVERDUE_31_60: '31–60\nngày',
  OVERDUE_60_PLUS: '> 60\nngày',
};

// Same severity scale as the customer aging table's amount colours.
const AGING_BUCKET_FILLS: Record<AgingBucket, string> = {
  NOT_DUE: 'var(--chart-1)',
  OVERDUE_1_7: 'var(--warning)',
  OVERDUE_8_30: 'var(--warning)',
  OVERDUE_31_60: 'var(--destructive)',
  OVERDUE_60_PLUS: 'var(--destructive)',
};

export function formatAgingBucketTick(bucket: AgingBucket): string {
  return AGING_BUCKET_LABELS[bucket];
}

export function formatAgingBucketShortTick(bucket: AgingBucket): string {
  return AGING_BUCKET_SHORT_LABELS[bucket];
}

function isAgingBucket(value: unknown): value is AgingBucket {
  return typeof value === 'string' && value in AGING_BUCKET_LABELS;
}

/**
 * Recharts writes a string tick value into one `<text>` node, and SVG
 * collapses a newline in that node to a space — so `tickFormatter` alone
 * cannot break a label across lines. Measured at 390px the single-line
 * labels rendered 48–74px wide inside ~52px slots, so all four neighbouring
 * pairs overlapped. Emitting one `<tspan>` per line is what actually stacks
 * them.
 */
function AgingBucketTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const lines = isAgingBucket(payload?.value)
    ? AGING_BUCKET_SHORT_LABELS[payload.value].split('\n')
    : [String(payload?.value ?? '')];

  return (
    <text
      x={x}
      y={y}
      dy={CHART_TICK.fontSize}
      textAnchor="middle"
      fill={CHART_TICK.fill}
      fontSize={CHART_TICK.fontSize}
    >
      {lines.map((line, index) => (
        <tspan
          key={line}
          x={x}
          /* recharts positions the tick by y; the first line starts there and
             the rest stack one line down. */
          dy={index === 0 ? 0 : CHART_TICK.fontSize + 2}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function AgingChart({ report }: { report: AgingReport }) {
  if (!hasChartValue(report.buckets.map((bucket) => bucket.totalRemaining))) {
    return (
      <EmptyState
        density="compact"
        icon={CalendarClock}
        title="Chưa có công nợ để phân tích"
        description="Tuổi nợ được tính từ các khoản phải thu còn lại."
        className="h-80"
      />
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={report.buckets}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="4 4"
            vertical={false}
          />
          <XAxis
            dataKey="bucket"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={<AgingBucketTick />}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tick={CHART_TICK}
            tickFormatter={(value: number) => formatVNDCompact(value)}
          />
          <Tooltip
            {...CHART_TOOLTIP_STYLE}
            formatter={(value) => [formatVND(Number(value)), 'Còn lại']}
            labelFormatter={(label) =>
              isAgingBucket(label) ? formatAgingBucketTick(label) : label
            }
          />
          <Bar dataKey="totalRemaining" name="Còn lại" radius={[4, 4, 0, 0]}>
            {report.buckets.map((bucket) => (
              <Cell
                key={bucket.bucket}
                fill={AGING_BUCKET_FILLS[bucket.bucket]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
