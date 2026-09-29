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
import { CHART_TICK, hasChartValue } from '@/lib/chart';
import { formatVND, formatVNDCompact } from '@/lib/format';
import type { ReportsTrend } from '../types';

const monthFormatter = new Intl.DateTimeFormat('vi-VN', {
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatTrendMonthLabel(key: string, isCurrent = false): string {
  return `Tháng ${monthFormatter.format(new Date(`${key}-01T00:00:00Z`))}${isCurrent ? ' (tạm tính)' : ''}`;
}

const SERIES = [
  { key: 'outstanding', name: 'Công nợ còn lại', color: 'var(--chart-1)' },
  { key: 'collected', name: 'Đã thu', color: 'var(--chart-2)' },
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

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label="Biểu đồ xu hướng công nợ và thu hồi"
        className="h-80 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={trend.items}
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
              tickLine={false}
              axisLine={false}
              tick={CHART_TICK}
              tickFormatter={(value: string) =>
                formatTrendMonthLabel(value, value === currentMonth)
              }
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={CHART_TICK}
              tickFormatter={(value: number) => formatVNDCompact(value)}
            />
            <Tooltip
              labelFormatter={(label) => {
                const month = String(label);
                return formatTrendMonthLabel(month, month === currentMonth);
              }}
              formatter={(value) =>
                value === null || value === undefined
                  ? 'Chưa có dữ liệu'
                  : formatVND(Number(value))
              }
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
      <p className="text-sm text-muted-foreground">
        Tháng hiện tại là số liệu tạm thời đến thời điểm hiện tại.
      </p>
    </div>
  );
}
