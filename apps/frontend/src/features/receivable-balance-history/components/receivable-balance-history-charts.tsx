import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type {
  ReceivableBalanceHistoryDailyPoint,
  ReceivableBalanceHistorySourcePoint,
} from '../types';

const SOURCE_LABELS: Record<string, string> = {
  CREATE: 'Tạo mới',
  ALLOCATE: 'Phân bổ',
  UNDO: 'Hoàn tác',
  CANCEL: 'Hủy',
  WRITE_OFF: 'Xóa nợ',
  ROLLOUT_BASELINE: 'Baseline',
};

const CHART_DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

export function formatChartDate(date: string): string {
  return CHART_DATE_FORMATTER.formatToParts(new Date(`${date}T00:00:00.000Z`))
    .filter((part) => part.type === 'day' || part.type === 'month')
    .map((part) => part.value)
    .join('/');
}

interface ChartsProps {
  dailySeries: ReceivableBalanceHistoryDailyPoint[];
  sourceDistribution: ReceivableBalanceHistorySourcePoint[];
}

export function ReceivableBalanceHistoryCharts({
  dailySeries,
  sourceDistribution,
}: ChartsProps) {
  const chartData = sourceDistribution.map((point) => ({
    name: SOURCE_LABELS[point.changeSource] ?? point.changeSource,
    value: point.count,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <h2 className="text-sm font-medium">Thay đổi theo ngày</h2>
        </CardHeader>
        <CardContent>
          {dailySeries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu trong khoảng thời gian này.
            </p>
          ) : (
            <div
              role="img"
              aria-label="Biểu đồ số thay đổi theo ngày"
              className="h-64 w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailySeries}
                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartDate}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip />
                  <Bar dataKey="transitions" fill="var(--primary)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-medium">Phân bố theo nguồn thay đổi</h2>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu trong khoảng thời gian này.
            </p>
          ) : (
            <div
              role="img"
              aria-label="Biểu đồ phân bố theo nguồn thay đổi"
              className="h-64 w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
