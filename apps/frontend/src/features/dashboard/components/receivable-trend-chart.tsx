import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTrendMonthLabel } from '@/features/reports/components/reports-trend-chart';
import type { ReportsTrend } from '@/features/reports/types';
import { formatVND } from '@/lib/format';

export function ReceivableTrendChart({ trend }: { trend: ReportsTrend }) {
  const currentMonth = trend.items.at(-1)?.month;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={trend.items}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <defs>
            <linearGradient id="outstandingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) =>
              formatTrendMonthLabel(value, value === currentMonth)
            }
          />
          <YAxis
            width={80}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              formatVND(value).replace(/\s₫$/u, '')
            }
          />
          <Tooltip
            labelFormatter={(label) =>
              formatTrendMonthLabel(
                String(label),
                String(label) === currentMonth,
              )
            }
            formatter={(value) =>
              value === null || value === undefined
                ? 'Chưa có dữ liệu'
                : formatVND(Number(value))
            }
          />
          <Area
            type="monotone"
            dataKey="outstanding"
            name="Công nợ"
            stroke="var(--chart-1)"
            fill="url(#outstandingFill)"
            connectNulls={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
