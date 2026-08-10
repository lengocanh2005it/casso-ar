import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import type { DashboardSummary as DashboardSummaryData } from '../types';

function formatRate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardSummary({
  summary,
}: {
  summary: DashboardSummaryData;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Tổng công nợ còn lại"
          value={formatVND(summary.totalOutstanding)}
        />
        <MetricCard
          label="Công nợ quá hạn"
          value={formatVND(summary.totalOverdue)}
        />
        <MetricCard
          label="Tỷ lệ quá hạn"
          value={formatRate(summary.overdueRate)}
        />
        <MetricCard
          label="Khớp tự động"
          value={formatRate(summary.autoMatchRate)}
        />
        <MetricCard
          label="Xử lý thủ công"
          value={formatRate(summary.manualHandlingRate)}
        />
        <MetricCard
          label="Hiệu quả nhắc thanh toán"
          value={formatRate(summary.reminderEffectiveness)}
        />
        <MetricCard
          label="Dự báo thu 7 ngày"
          value={formatVND(summary.cashForecast.forecast7d)}
        />
        <MetricCard
          label="Dự báo thu 14 ngày"
          value={formatVND(summary.cashForecast.forecast14d)}
        />
        <MetricCard
          label="Dự báo thu 30 ngày"
          value={formatVND(summary.cashForecast.forecast30d)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Khách hàng quá hạn nhiều nhất</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.topOverdueCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có khách hàng quá hạn.
            </p>
          ) : (
            <div className="space-y-2">
              {summary.topOverdueCustomers.map((customer) => (
                <div
                  key={customer.customerId}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="truncate">{customer.customerName}</span>
                  <span className="shrink-0 font-medium tabular-nums">
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
