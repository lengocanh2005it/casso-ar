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

function PaymentTooltip({
  active,
  payload,
  label,
  currentMonth,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
  currentMonth?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium">
        {formatTrendMonthLabel(label ?? '', label === currentMonth)}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted-foreground">
          {formatVND(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function PaymentActivityChart({ trend }: { trend: ReportsTrend }) {
  if (trend.items.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Chưa có dữ liệu thanh toán.
      </div>
    );
  }

  const currentMonth = trend.items.at(-1)?.month;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={trend.items}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="4 4"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: string) =>
              formatTrendMonthLabel(value, value === currentMonth)
            }
          />
          <YAxis
            width={80}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: number) =>
              formatVND(value).replace(/\s₫$/u, '')
            }
          />
          <Tooltip content={<PaymentTooltip currentMonth={currentMonth} />} />
          <Bar
            dataKey="collected"
            name="Đã thu"
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
