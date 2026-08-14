import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatVND } from '@/lib/format';
import type { ReportsTrend } from '../types';

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `Tháng ${Number(month)}/${year}`;
}

export function ReportsTrendChart({ trend }: { trend: ReportsTrend }) {
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: string) => monthLabel(value)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                formatVND(value).replace(/\s₫$/u, '')
              }
            />
            <Tooltip
              labelFormatter={(label) => monthLabel(String(label))}
              formatter={(value) =>
                value === null || value === undefined
                  ? 'Chưa có dữ liệu'
                  : formatVND(Number(value))
              }
            />
            <Line
              type="monotone"
              dataKey="outstanding"
              name="Công nợ"
              stroke="var(--chart-1)"
              connectNulls={false}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="collected"
              name="Đã thu"
              stroke="var(--chart-2)"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
