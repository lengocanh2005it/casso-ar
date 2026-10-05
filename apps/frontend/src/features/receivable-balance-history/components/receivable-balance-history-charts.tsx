import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/layout/empty-state';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CHART_TICK, CHART_TOOLTIP_STYLE, hasChartValue } from '@/lib/chart';
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

const SOURCE_COLORS: Record<string, string> = {
  CREATE: 'var(--chart-1)',
  ALLOCATE: 'var(--chart-2)',
  UNDO: 'var(--chart-3)',
  CANCEL: 'var(--chart-4)',
  WRITE_OFF: 'var(--chart-5)',
  ROLLOUT_BASELINE: 'var(--chart-1)',
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
    color: SOURCE_COLORS[point.changeSource] ?? 'var(--chart-5)',
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-4 text-primary" />
            <CardTitle role="heading" aria-level={2}>
              Thay đổi theo ngày
            </CardTitle>
          </div>
          <CardDescription>
            Số lần công nợ thay đổi trạng thái theo từng ngày
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasChartValue(dailySeries.map((point) => point.transitions)) ? (
            <EmptyState
              density="compact"
              icon={BarChart3}
              title="Chưa có thay đổi trong khoảng này"
              description="Chọn khoảng thời gian khác để xem biến động."
              className="h-64"
            />
          ) : (
            <>
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
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      interval="preserveStartEnd"
                      minTickGap={12}
                      tickLine={false}
                      axisLine={false}
                      tick={CHART_TICK}
                    />
                    <YAxis
                      width={40}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={CHART_TICK}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Bar
                      dataKey="transitions"
                      fill="var(--primary)"
                      radius={4}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only">
                <caption>Số lần thay đổi công nợ theo ngày</caption>
                <thead>
                  <tr>
                    <th scope="col">Ngày</th>
                    <th scope="col">Số lần thay đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySeries.map((point) => (
                    <tr key={point.date}>
                      <th scope="row">{formatChartDate(point.date)}</th>
                      <td>{point.transitions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PieChartIcon aria-hidden="true" className="size-4 text-primary" />
            <CardTitle role="heading" aria-level={2}>
              Phân bố theo nguồn thay đổi
            </CardTitle>
          </div>
          <CardDescription>
            Tỷ trọng các nguyên nhân gây thay đổi số dư công nợ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState
              density="compact"
              icon={PieChartIcon}
              title="Chưa có thay đổi trong khoảng này"
              description="Chọn khoảng thời gian khác để xem nguồn thay đổi."
              className="h-64"
            />
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
                    innerRadius="55%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {chartData.map((point) => (
                      <Cell key={point.name} fill={point.color} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {chartData.length > 0 && (
            <ul
              aria-label="Chú giải nguồn thay đổi"
              className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
            >
              {chartData.map((point) => (
                <li key={point.name} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: point.color }}
                  />
                  <span>{point.name}</span>
                  <span className="tabular-nums">({point.value})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
