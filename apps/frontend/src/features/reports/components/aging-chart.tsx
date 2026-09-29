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
import { CHART_TICK, hasChartValue } from '@/lib/chart';
import { formatVND, formatVNDCompact } from '@/lib/format';
import type { AgingBucket, AgingReport } from '../types';
import { AGING_BUCKET_LABELS } from './customer-aging-filters';

// Axis ticks: the full "Quá hạn 8–30 ngày" labels did not fit five across,
// so recharts silently skipped every other one. The tooltip keeps the long form.
const AGING_BUCKET_SHORT_LABELS: Record<AgingBucket, string> = {
  NOT_DUE: 'Chưa đến hạn',
  OVERDUE_1_7: '1–7 ngày',
  OVERDUE_8_30: '8–30 ngày',
  OVERDUE_31_60: '31–60 ngày',
  OVERDUE_60_PLUS: '> 60 ngày',
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
            tick={CHART_TICK}
            tickFormatter={formatAgingBucketShortTick}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tick={CHART_TICK}
            tickFormatter={(value: number) => formatVNDCompact(value)}
          />
          <Tooltip
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
