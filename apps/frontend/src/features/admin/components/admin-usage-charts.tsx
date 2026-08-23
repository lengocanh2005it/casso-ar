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

interface AdminUsageChartsProps {
  topOrganizations: AiUsageAggregateItem[];
  trend: AiUsageTrendPoint[];
}

export function AdminUsageCharts({
  topOrganizations,
  trend,
}: AdminUsageChartsProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-balance leading-none font-semibold">
            Tổ chức dùng AI nhiều nhất (7 ngày)
          </h2>
          <CardDescription>
            Các tổ chức gọi AI nhiều nhất trong 7 ngày qua
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {topOrganizations.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                density="compact"
                icon={BarChart3}
                title="Chưa có dữ liệu usage."
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topOrganizations}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="organizationName" />
                <YAxis tickFormatter={formatNumber} />
                <Tooltip formatter={(value) => formatNumber(Number(value))} />
                <Bar dataKey="requestCount" fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
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
                title="Chưa có dữ liệu usage."
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => formatTrendDate(value)}
                />
                <YAxis tickFormatter={formatNumber} />
                <Tooltip
                  formatter={(value) => formatNumber(Number(value))}
                  labelFormatter={(value) => formatTrendDate(String(value))}
                />
                <Line
                  type="monotone"
                  dataKey="requestCount"
                  stroke="var(--chart-2)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </>
  );
}
