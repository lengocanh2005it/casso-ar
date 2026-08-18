import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTrendMonthLabel } from '@/features/reports/components/reports-trend-chart';
import type { ReportsTrend } from '@/features/reports/types';
import { formatVND } from '@/lib/format';

export function PaymentActivityChart({ trend }: { trend: ReportsTrend }) {
  const currentMonth = trend.items.at(-1)?.month;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={trend.items}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
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
            formatter={(value) => formatVND(Number(value))}
          />
          <Bar
            dataKey="collected"
            name="Đã thu"
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
