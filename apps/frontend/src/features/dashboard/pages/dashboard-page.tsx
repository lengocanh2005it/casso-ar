import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import { useDashboardSummary } from '@/features/reports/api/use-reports';
import { formatVND } from '@/lib/format';
import { useOrganizationActivity } from '../api/use-organization-activity';
import { PendingReviewBanner } from '../components/pending-review-banner';
import { RecentActivityFeed } from '../components/recent-activity-feed';

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function formatRate(value: number | null): string {
  return value === null ? '—' : percentFormatter.format(value);
}

function MetricCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className={className}>
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

function SummarySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải dữ liệu"
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid never reorders
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
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

      {reviewCountQuery.isError ? (
        <p role="status" className="text-sm text-destructive">
          Không thể tải số lượng cần đối soát.
        </p>
      ) : (
        <PendingReviewBanner pendingCount={pendingCount} />
      )}

      {summaryQuery.isPending ? (
        <SummarySkeleton />
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <div className="flex items-center gap-3">
          <p role="status" className="text-sm text-destructive">
            Không thể tải dữ liệu tổng quan.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void summaryQuery.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Tổng công nợ còn lại"
              value={formatVND(summaryQuery.data.totalOutstanding)}
              className="animate-fade-up motion-reduce:animate-none"
            />
            <MetricCard
              label="Công nợ quá hạn"
              value={formatVND(summaryQuery.data.totalOverdue)}
              className="animate-fade-up motion-reduce:animate-none [animation-delay:40ms]"
            />
            <MetricCard
              label="Tỷ lệ quá hạn"
              value={formatRate(summaryQuery.data.overdueRate)}
              className="animate-fade-up motion-reduce:animate-none [animation-delay:80ms]"
            />
            <MetricCard
              label="Cần đối soát"
              value={String(pendingCount)}
              className="animate-fade-up motion-reduce:animate-none [animation-delay:120ms]"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:160ms]">
              <CardHeader>
                <CardTitle>Hoạt động gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                {activityQuery.isPending ? (
                  <div
                    role="status"
                    aria-live="polite"
                    aria-label="Đang tải dữ liệu"
                    className="space-y-3"
                  >
                    {Array.from({ length: 5 }, (_, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                ) : activityQuery.isError || !activityQuery.data ? (
                  <div className="flex items-center gap-3">
                    <p role="status" className="text-sm text-destructive">
                      Không thể tải hoạt động.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void activityQuery.refetch()}
                    >
                      Thử lại
                    </Button>
                  </div>
                ) : (
                  <RecentActivityFeed items={activityQuery.data.items} />
                )}
              </CardContent>
            </Card>

            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:200ms]">
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
