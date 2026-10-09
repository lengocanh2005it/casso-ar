import { TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/layout/empty-state';
import {
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  hasChartValue,
  maxMoney,
  moneyPercent,
} from '@/lib/chart';
import { formatVND } from '@/lib/format';
import type { ReportsTrend } from '../types';

const monthFormatter = new Intl.DateTimeFormat('vi-VN', {
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

// Axis ticks stay terse. At 390px the last slot is ~139px, and
// "Tháng 10/2026 (tạm tính)" rendered 140px — it spilled into its
// neighbour. The month reads fine as "10/2026"; the "provisional" caveat now
// lives in the caption below the chart, where it has room to be a sentence.
// The tooltip still has the width to spell it out, so it keeps the long form.
export function formatTrendMonthLabel(key: string, isCurrent = false): string {
  const month = monthFormatter.format(new Date(`${key}-01T00:00:00Z`));
  return isCurrent ? `Tháng ${month} (tạm tính)` : month;
}

const SERIES = [
  {
    key: 'outstandingPercent',
    name: 'Công nợ còn lại',
    color: 'var(--chart-1)',
  },
  { key: 'collectedPercent', name: 'Đã thu', color: 'var(--chart-2)' },
] as const;

export function ReportsTrendChart({ trend }: { trend: ReportsTrend }) {
  const hasData = trend.items.some((point) =>
    hasChartValue([point.outstanding, point.collected]),
  );
  if (!hasData) {
    return (
      <EmptyState
        density="compact"
        icon={TrendingUp}
        title="Chưa có dữ liệu xu hướng"
        description="Biểu đồ sẽ hiển thị khi có khoản phải thu hoặc khoản thu phát sinh."
        className="h-80"
      />
    );
  }

  const currentMonth = trend.items.at(-1)?.month;
  const hasUnavailablePoints = trend.items.some(
    (point) => point.outstanding === null,
  );
  const maximum = maxMoney(
    trend.items.flatMap((point) => [point.outstanding, point.collected]),
  );
  const chartData = trend.items.map((point) => ({
    ...point,
    outstandingPercent:
      point.outstanding === null
        ? null
        : moneyPercent(point.outstanding, maximum),
    collectedPercent: moneyPercent(point.collected, maximum),
  }));

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label="Biểu đồ xu hướng công nợ và thu hồi, tỷ lệ so với giá trị tháng cao nhất"
        className="h-80 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
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
              padding={{ left: 8, right: 12 }}
              tickLine={false}
              axisLine={false}
              tick={CHART_TICK}
              // No `isCurrent` here on purpose: the "(tạm tính)" suffix made
              // the label 140px in a ~139px slot at 390px. The caveat lives in
              // the caption under the chart and in the tooltip.
              tickFormatter={(value: string) => formatTrendMonthLabel(value)}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={CHART_TICK}
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              {...CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => {
                const month = String(label);
                return formatTrendMonthLabel(month, month === currentMonth);
              }}
              formatter={(_value, _name, item) => {
                const original =
                  item.dataKey === 'outstandingPercent'
                    ? item.payload.outstanding
                    : item.payload.collected;
                return original === null
                  ? 'Chưa có dữ liệu'
                  : formatVND(original);
              }}
            />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.name}
                stroke={series.color}
                strokeWidth={2}
                connectNulls={false}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Trục dọc: 100% là giá trị tháng cao nhất.
      </p>
      <table className="sr-only">
        <caption>Giá trị biểu đồ xu hướng công nợ và thu hồi</caption>
        <thead>
          <tr>
            <th scope="col">Tháng</th>
            <th scope="col">Công nợ còn lại</th>
            <th scope="col">Đã thu</th>
          </tr>
        </thead>
        <tbody>
          {trend.items.map((point) => (
            <tr key={point.month}>
              <th scope="row">{formatTrendMonthLabel(point.month)}</th>
              <td>
                {point.outstanding === null
                  ? 'Chưa có dữ liệu'
                  : formatVND(point.outstanding)}
              </td>
              <td>
                {point.collected === null
                  ? 'Chưa có dữ liệu'
                  : formatVND(point.collected)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul
        aria-label="Chú giải biểu đồ"
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
      >
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.name}
          </li>
        ))}
      </ul>
      {hasUnavailablePoints && (
        <p className="text-sm text-muted-foreground">
          Một số tháng trước thời điểm theo dõi lịch sử chưa có dữ liệu công nợ.
        </p>
      )}
      {currentMonth && (
        <p className="text-sm text-muted-foreground">
          {`Tháng ${monthFormatter.format(new Date(`${currentMonth}-01T00:00:00Z`))} là tháng hiện tại nên số liệu là tạm tính.`}
        </p>
      )}
    </div>
  );
}
