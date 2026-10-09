import { TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/layout/empty-state';
import { formatTrendMonthLabel } from '@/features/reports/components/reports-trend-chart';
import type { ReportsTrend } from '@/features/reports/types';
import { CHART_TICK, hasChartValue, maxMoney, moneyPercent } from '@/lib/chart';
import { formatVND } from '@/lib/format';

function TrendTooltip({
  active,
  payload,
  label,
  currentMonth,
}: {
  active?: boolean;
  payload?: Array<{
    value: number | null;
    name: string;
    payload: { outstanding: string | null };
  }>;
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
          {entry.payload.outstanding === null
            ? 'Chưa có dữ liệu'
            : formatVND(entry.payload.outstanding)}
        </p>
      ))}
    </div>
  );
}

export function ReceivableTrendChart({ trend }: { trend: ReportsTrend }) {
  if (!hasChartValue(trend.items.map((item) => item.outstanding))) {
    return (
      <EmptyState
        density="compact"
        icon={TrendingUp}
        title="Chưa có dữ liệu xu hướng"
        description="Biểu đồ sẽ hiển thị khi có khoản phải thu phát sinh."
        className="h-72"
      />
    );
  }

  const currentMonth = trend.items.at(-1)?.month;
  const maximum = maxMoney(trend.items.map((item) => item.outstanding));
  const chartData = trend.items.map((item) => ({
    ...item,
    percentage:
      item.outstanding === null
        ? null
        : moneyPercent(item.outstanding, maximum),
  }));

  return (
    <div className="space-y-2">
      <div
        role="img"
        className="h-72 w-full"
        aria-label="Công nợ theo tháng, tỷ lệ so với tháng cao nhất"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 32, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="outstandingFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="4 4"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              interval="preserveStartEnd"
              minTickGap={12}
              padding={{ left: 8, right: 12 }}
              tickLine={false}
              axisLine={false}
              tick={CHART_TICK}
              tickFormatter={(value: string) => formatTrendMonthLabel(value)}
            />
            <YAxis
              width={80}
              tickLine={false}
              axisLine={false}
              tick={CHART_TICK}
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip content={<TrendTooltip currentMonth={currentMonth} />} />
            <Area
              type="monotone"
              dataKey="percentage"
              name="Công nợ"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#outstandingFill)"
              connectNulls={false}
              dot={{ fill: 'var(--chart-1)', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Trục dọc: 100% là tháng có công nợ cao nhất.
      </p>
      <table className="sr-only">
        <caption>Chi tiết công nợ theo tháng</caption>
        <thead>
          <tr>
            <th scope="col">Tháng</th>
            <th scope="col">Công nợ còn lại</th>
          </tr>
        </thead>
        <tbody>
          {trend.items.map((item) => (
            <tr key={item.month}>
              <th scope="row">
                {formatTrendMonthLabel(item.month, item.month === currentMonth)}
              </th>
              <td>
                {item.outstanding === null
                  ? 'Chưa có dữ liệu'
                  : formatVND(item.outstanding)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
