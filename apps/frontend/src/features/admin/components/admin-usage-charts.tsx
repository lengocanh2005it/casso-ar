import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { CHART_TICK, CHART_TOOLTIP_STYLE } from '@/lib/chart';
import type { AiUsageAggregateItem, AiUsageTrendPoint } from '../api/admin-api';

const trendDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
});
const numberFormatter = new Intl.NumberFormat('vi-VN');

function formatTrendDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : trendDateFormatter.format(date);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

// The usage endpoint reports one row per (organization × model) because the
// detail table needs that split. The "busiest organizations" chart answers a
// different question, so roll the rows up and keep the heaviest callers.
export const MAX_ORGANIZATION_BARS = 6;

interface OrganizationUsage {
  organizationId: string;
  organizationName: string;
  axisLabel: string;
  requestCount: number;
}

// Vietnamese legal names reach 60+ characters, which no axis width can hold
// without squeezing the bars out of the card. Trim the middle — the tail is
// the part that tells two similar company names apart — and let the tooltip
// carry the full name.
const AXIS_LABEL_MAX = 26;

export function toAxisLabel(organizationName: string): string {
  if (organizationName.length <= AXIS_LABEL_MAX) return organizationName;
  const head = Math.ceil((AXIS_LABEL_MAX - 1) / 2);
  const tail = AXIS_LABEL_MAX - 1 - head;
  return `${organizationName.slice(0, head)}…${organizationName.slice(-tail)}`;
}

export function rollUpByOrganization(
  rows: ReadonlyArray<AiUsageAggregateItem>,
): OrganizationUsage[] {
  const totals = new Map<string, OrganizationUsage>();
  for (const row of rows) {
    const existing = totals.get(row.organizationId);
    if (existing) {
      existing.requestCount += row.requestCount;
      continue;
    }
    totals.set(row.organizationId, {
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      axisLabel: toAxisLabel(row.organizationName),
      requestCount: row.requestCount,
    });
  }

  return [...totals.values()]
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, MAX_ORGANIZATION_BARS);
}

interface AdminUsageChartsProps {
  topOrganizations: AiUsageAggregateItem[];
  trend: AiUsageTrendPoint[];
}

export function AdminUsageCharts({
  topOrganizations,
  trend,
}: AdminUsageChartsProps) {
  const organizationUsage = rollUpByOrganization(topOrganizations);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardHeader>
          <h2 className="text-balance leading-none font-semibold">
            Tổ chức dùng AI nhiều nhất (7 ngày)
          </h2>
          <CardDescription>
            Các tổ chức gọi AI nhiều nhất trong 7 ngày qua
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {organizationUsage.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                density="compact"
                icon={BarChart3}
                title="Chưa có dữ liệu sử dụng."
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {/* Horizontal bars: Vietnamese legal names need the vertical
                  axis, and as columns they collided until Recharts dropped
                  most of the ticks. */}
              <BarChart
                data={organizationUsage}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={CHART_TICK}
                  tickFormatter={formatNumber}
                />
                <YAxis
                  type="category"
                  dataKey="axisLabel"
                  tickLine={false}
                  axisLine={false}
                  tick={CHART_TICK}
                  width={200}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(value) => [
                    formatNumber(Number(value)),
                    'Lượt gọi',
                  ]}
                  labelFormatter={(_, payload) =>
                    String(payload?.[0]?.payload?.organizationName ?? '')
                  }
                />
                <Bar
                  dataKey="requestCount"
                  name="Lượt gọi"
                  fill="var(--chart-1)"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:80ms]">
        <CardHeader>
          <h2 className="text-balance leading-none font-semibold">
            Xu hướng dùng AI theo ngày (7 ngày)
          </h2>
          <CardDescription>
            Số lượt gọi AI theo từng ngày trong 7 ngày qua
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {trend.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                density="compact"
                icon={BarChart3}
                title="Chưa có dữ liệu sử dụng."
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={CHART_TICK}
                  tickFormatter={(value: string) => formatTrendDate(value)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={CHART_TICK}
                  tickFormatter={formatNumber}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(value) => [
                    formatNumber(Number(value)),
                    'Lượt gọi',
                  ]}
                  labelFormatter={(value) => formatTrendDate(String(value))}
                />
                <Line
                  type="monotone"
                  dataKey="requestCount"
                  name="Lượt gọi"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
