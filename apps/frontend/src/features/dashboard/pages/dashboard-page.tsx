import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  Clock,
  CreditCard,
  FileSearch,
  PieChart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { MetricCard } from '@/components/metric-card';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import {
  useDashboardSummary,
  useReportsTrend,
} from '@/features/reports/api/use-reports';
import { formatVND } from '@/lib/format';
import { useOrganizationActivity } from '../api/use-organization-activity';
import { OverdueDonutChart } from '../components/overdue-donut-chart';
import { PaymentActivityChart } from '../components/payment-activity-chart';
import { PendingReviewBanner } from '../components/pending-review-banner';
import { ReceivableTrendChart } from '../components/receivable-trend-chart';
import { RecentActivityFeed } from '../components/recent-activity-feed';

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function formatRate(value: number | null): string {
  return value === null ? '—' : percentFormatter.format(value);
}

function SummarySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải dữ liệu"
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
  const { user } = useAuth();
  const reviewCountQuery = useReviewCount();
  const summaryQuery = useDashboardSummary();
  const activityQuery = useOrganizationActivity();
  const trendQuery = useReportsTrend(6);

  const pendingCount = reviewCountQuery.data ?? 0;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="TỔNG QUAN"
        title="Trang chủ"
        description="Tổng quan về công nợ và hoạt động thu hồi của bạn."
      />

      <h2 className="text-xl font-semibold tracking-tight text-primary">
        Chào mừng{' '}
        <span className="text-foreground">
          {user?.organizationName ?? 'bạn'}
        </span>{' '}
        đến với Casso Ledger!
      </h2>

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Tổng công nợ còn lại"
              description="Tất cả công nợ chưa thanh toán"
              value={formatVND(summaryQuery.data.totalOutstanding)}
              icon={CircleDollarSign}
              variant="default"
              className="animate-fade-up motion-reduce:animate-none"
            />
            <MetricCard
              label="Công nợ quá hạn"
              description="Công nợ đã vượt ngày đến hạn"
              value={formatVND(summaryQuery.data.totalOverdue)}
              icon={AlertTriangle}
              variant="danger"
              className="animate-fade-up motion-reduce:animate-none [animation-delay:40ms]"
            />
            <MetricCard
              label="Tỷ lệ quá hạn"
              description="Tỷ lệ công nợ quá hạn trên tổng"
              value={formatRate(summaryQuery.data.overdueRate)}
              icon={Clock}
              variant="warning"
              className="animate-fade-up motion-reduce:animate-none [animation-delay:80ms]"
            />
            <MetricCard
              label="Cần đối soát"
              description="Giao dịch ngân hàng chờ đối chiếu"
              value={String(pendingCount)}
              icon={FileSearch}
              variant="success"
              className="animate-fade-up motion-reduce:animate-none [animation-delay:120ms]"
            />
          </div>

          <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:160ms]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-blue-500" />
                <CardTitle>Xu hướng công nợ 6 tháng</CardTitle>
              </div>
              <CardDescription>
                Biểu đồ xu hướng tăng giảm công nợ theo thời gian
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendQuery.isPending ? (
                <Skeleton className="h-72 w-full" />
              ) : trendQuery.isError || !trendQuery.data ? (
                <p className="text-sm text-muted-foreground">
                  Không thể tải dữ liệu xu hướng.
                </p>
              ) : (
                <ReceivableTrendChart trend={trendQuery.data} />
              )}
            </CardContent>
          </Card>

          <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:200ms]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PieChart className="size-4 text-amber-500" />
                <CardTitle>Tỷ lệ quá hạn</CardTitle>
              </div>
              <CardDescription>
                Phân tích tỷ lệ công nợ đúng hạn và quá hạn
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OverdueDonutChart
                totalOutstanding={summaryQuery.data.totalOutstanding}
                totalOverdue={summaryQuery.data.totalOverdue}
              />
            </CardContent>
          </Card>

          {trendQuery.data && (
            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:240ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-violet-500" />
                  <CardTitle>Hoạt động thanh toán 6 tháng</CardTitle>
                </div>
                <CardDescription>
                  Tổng hợp tiền thu và hoàn trong 6 tháng gần nhất
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentActivityChart trend={trendQuery.data} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:280ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-emerald-500" />
                  <CardTitle>Hoạt động gần đây</CardTitle>
                </div>
                <CardDescription>
                  Các sự kiện mới nhất trong hệ thống
                </CardDescription>
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

            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:320ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-red-500" />
                  <CardTitle>Khách hàng quá hạn nhiều nhất</CardTitle>
                </div>
                <CardDescription>
                  Top khách hàng có tổng công nợ quá hạn cao nhất
                </CardDescription>
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
