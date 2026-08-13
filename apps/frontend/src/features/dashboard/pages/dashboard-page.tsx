import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import { useDashboardSummary } from '@/features/reports/api/use-reports';
import { formatVND } from '@/lib/format';
import { useOrganizationActivity } from '../api/use-organization-activity';
import { PendingReviewBanner } from '../components/pending-review-banner';
import { RecentActivityFeed } from '../components/recent-activity-feed';

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

export function DashboardPage() {
  const reviewCountQuery = useReviewCount();
  const summaryQuery = useDashboardSummary();
  const activityQuery = useOrganizationActivity();

  const pendingCount = reviewCountQuery.data ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">TỔNG QUAN</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Trang chủ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Việc cần làm hôm nay.
        </p>
      </div>

      <PendingReviewBanner pendingCount={pendingCount} />

      {summaryQuery.isPending ? (
        <p>Đang tải…</p>
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <p className="text-destructive">Không thể tải dữ liệu tổng quan.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Tổng công nợ còn lại"
              value={formatVND(summaryQuery.data.totalOutstanding)}
            />
            <MetricCard
              label="Công nợ quá hạn"
              value={formatVND(summaryQuery.data.totalOverdue)}
            />
            <MetricCard
              label="Tỷ lệ quá hạn"
              value={formatRate(summaryQuery.data.overdueRate)}
            />
            <MetricCard label="Cần đối soát" value={String(pendingCount)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Hoạt động gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                {activityQuery.isPending ? (
                  <p className="text-sm text-muted-foreground">Đang tải…</p>
                ) : activityQuery.isError || !activityQuery.data ? (
                  <p className="text-sm text-destructive">
                    Không thể tải hoạt động.
                  </p>
                ) : (
                  <RecentActivityFeed items={activityQuery.data.items} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Khách hàng quá hạn nhiều nhất</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryQuery.data.topOverdueCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có khách hàng quá hạn.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {summaryQuery.data.topOverdueCustomers.map((customer) => (
                      <div
                        key={customer.customerId}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="truncate">
                          {customer.customerName}
                        </span>
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
        </>
      )}
    </div>
  );
}
