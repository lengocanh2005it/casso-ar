import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Hand,
  TrendingUp,
  Users,
} from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { MetricCard } from '@/components/metric-card';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import type { DashboardSummary as DashboardSummaryData } from '../types';

function formatRate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function DashboardSummary({
  summary,
}: {
  summary: DashboardSummaryData;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Tổng công nợ còn lại"
          description="Tất cả công nợ chưa thanh toán"
          value={formatVND(summary.totalOutstanding)}
          amount={summary.totalOutstanding}
          icon={CircleDollarSign}
          variant="default"
        />
        <MetricCard
          label="Công nợ quá hạn"
          description="Công nợ đã vượt ngày đến hạn"
          value={formatVND(summary.totalOverdue)}
          amount={summary.totalOverdue}
          icon={AlertTriangle}
          variant="danger"
        />
        <MetricCard
          label="Tỷ lệ quá hạn"
          description="Tỷ lệ công nợ quá hạn trên tổng"
          value={formatRate(summary.overdueRate)}
          icon={Clock}
          variant="warning"
          empty={summary.totalOutstanding === 0}
        />
        <MetricCard
          label="Khớp tự động"
          description="Tỷ lệ giao dịch khớp tự động"
          value={formatRate(summary.autoMatchRate)}
          icon={CheckCircle2}
          variant="success"
          empty={summary.autoMatchRate === null}
        />
        <MetricCard
          label="Xử lý thủ công"
          description="Tỷ lệ giao dịch cần xử lý thủ công"
          value={formatRate(summary.manualHandlingRate)}
          icon={Hand}
          variant="warning"
          empty={summary.manualHandlingRate === null}
        />
        <MetricCard
          label="Hiệu quả nhắc thanh toán"
          description="Tỷ lệ thu được sau khi nhắc"
          value={formatRate(summary.reminderEffectiveness)}
          icon={Bell}
          variant="default"
          empty={summary.reminderEffectiveness === null}
        />
        <MetricCard
          label="Dự báo thu 7 ngày"
          description="Dự kiến thu trong 7 ngày tới"
          value={formatVND(summary.cashForecast.forecast7d)}
          amount={summary.cashForecast.forecast7d}
          icon={TrendingUp}
          variant="success"
        />
        <MetricCard
          label="Dự báo thu 14 ngày"
          description="Dự kiến thu trong 14 ngày tới"
          value={formatVND(summary.cashForecast.forecast14d)}
          amount={summary.cashForecast.forecast14d}
          icon={TrendingUp}
          variant="success"
        />
        <MetricCard
          label="Dự báo thu 30 ngày"
          description="Dự kiến thu trong 30 ngày tới"
          value={formatVND(summary.cashForecast.forecast30d)}
          amount={summary.cashForecast.forecast30d}
          icon={TrendingUp}
          variant="success"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-4 text-destructive" />
            <CardTitle>Khách hàng quá hạn nhiều nhất</CardTitle>
          </div>
          <CardDescription>
            Top khách hàng có tổng công nợ quá hạn cao nhất
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.topOverdueCustomers.length === 0 ? (
            <EmptyState
              density="compact"
              icon={Users}
              title="Chưa có khách hàng quá hạn"
              description="Danh sách sẽ xuất hiện khi có khoản quá hạn cần theo dõi."
            />
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border border-border/70">
              {summary.topOverdueCustomers.map((customer) => (
                <div
                  key={customer.customerId}
                  className="flex items-center justify-between gap-4 px-3 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <InitialsAvatar name={customer.customerName} size="sm" />
                    <span
                      className="min-w-0 truncate font-medium"
                      title={customer.customerName}
                    >
                      {customer.customerName}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-lg bg-destructive/10 px-2.5 py-1 font-semibold tabular-nums text-destructive">
                    {formatVND(customer.totalOverdue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
