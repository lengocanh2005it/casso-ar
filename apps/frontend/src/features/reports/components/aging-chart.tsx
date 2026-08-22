import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatVND } from '@/lib/format';
import type { AgingBucket, AgingReport } from '../types';
import { AGING_BUCKET_LABELS } from './customer-aging-filters';

export function formatAgingBucketTick(bucket: AgingBucket): string {
  return AGING_BUCKET_LABELS[bucket];
}

function isAgingBucket(value: unknown): value is AgingBucket {
  return typeof value === 'string' && value in AGING_BUCKET_LABELS;
}

export function AgingChart({ report }: { report: AgingReport }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={report.buckets}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAgingBucketTick}
          />
          <YAxis
            width={96}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              formatVND(value).replace(/\s₫$/u, '')
            }
          />
          <Tooltip
            formatter={(value) => formatVND(Number(value))}
            labelFormatter={(label) =>
              isAgingBucket(label) ? formatAgingBucketTick(label) : label
            }
          />
          <Bar
            dataKey="totalRemaining"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
