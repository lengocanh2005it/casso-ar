import { CreditCard } from 'lucide-react';
import {
  Bar,
  BarChart,
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

function PaymentTooltip({
  active,
  payload,
  label,
  currentMonth,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    payload: { collected: string };
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
          {formatVND(entry.payload.collected)}
        </p>
      ))}
    </div>
  );
}

export function PaymentActivityChart({ trend }: { trend: ReportsTrend }) {
  if (!hasChartValue(trend.items.map((item) => item.collected))) {
    return (
      <EmptyState
        density="compact"
        icon={CreditCard}
        title="Chưa có khoản thu nào"
        description="Tiền về tài khoản được khớp vào công nợ sẽ hiển thị theo tháng tại đây."
        className="h-72"
      />
    );
  }

  const currentMonth = trend.items.at(-1)?.month;
  const maximum = maxMoney(trend.items.map((item) => item.collected));
  const chartData = trend.items.map((item) => ({
    ...item,
    percentage: moneyPercent(item.collected, maximum),
  }));

  return (
    <div className="space-y-2">
      <div
        role="img"
        className="h-72 w-full"
        aria-label="Thanh toán theo tháng, tỷ lệ so với tháng cao nhất"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="4 4"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              interval="preserveStartEnd"
              minTickGap={12}
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
            <Tooltip content={<PaymentTooltip currentMonth={currentMonth} />} />
            <Bar
              dataKey="percentage"
              name="Đã thu"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Trục dọc: 100% là tháng thu nhiều nhất.
      </p>
      <table className="sr-only">
        <caption>Chi tiết khoản thu theo tháng</caption>
        <thead>
          <tr>
            <th scope="col">Tháng</th>
            <th scope="col">Đã thu</th>
          </tr>
        </thead>
        <tbody>
          {trend.items.map((item) => (
            <tr key={item.month}>
              <th scope="row">
                {formatTrendMonthLabel(item.month, item.month === currentMonth)}
              </th>
              <td>{formatVND(item.collected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {currentMonth && (
        <p className="text-sm text-muted-foreground">
          {`Tháng ${formatTrendMonthLabel(currentMonth)} là tháng hiện tại nên số liệu là tạm tính.`}
        </p>
      )}
    </div>
  );
}
