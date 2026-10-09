import { Permission } from '@casso-ar/shared-types';
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  Clock,
  CreditCard,
  FileSearch,
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeading } from '@/components/layout/page-heading';
import { MetricCard } from '@/components/metric-card';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { TrendMonthsSelect } from '@/components/shared/trend-months-select';
import { TruncatedName } from '@/components/shared/truncated-text';
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
import { parseTrendMonths } from '@/features/reports/trend-months';
import type { TrendMonths } from '@/features/reports/types';
import { formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useOrganizationActivity } from '../api/use-organization-activity';
import { GettingStartedCard } from '../components/getting-started-card';
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
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { searchParams, patch } = useUrlQueryParams();
  const reviewCountQuery = useReviewCount();
  const summaryQuery = useDashboardSummary();
  const activityQuery = useOrganizationActivity();
  const trendMonths = parseTrendMonths(searchParams.get('trendMonths'), 6);
  const trendQuery = useReportsTrend(trendMonths);

  function setTrendMonths(months: TrendMonths) {
    patch((next) => {
      next.set('trendMonths', String(months));
    });
  }

  const pendingCount = reviewCountQuery.data ?? 0;
  // Nothing owed, no overdue customers and no activity yet: the org has not
  // imported anything, so point at the first steps instead of empty charts.
  // Only for roles that can act on the steps (FE rule: hide, never disable).
  const isNewOrganization =
    hasPermission(user?.role ?? null, Permission.RECEIVABLE_IMPORT) &&
    summaryQuery.data?.totalOutstanding === '0' &&
    summaryQuery.data.topOverdueCustomers.length === 0 &&
    activityQuery.data?.items.length === 0;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="TỔNG QUAN"
        title="Trang chủ"
        description={
          user?.organizationName
            ? `Công nợ và hoạt động thu hồi của ${user.organizationName}.`
            : 'Tổng quan về công nợ và hoạt động thu hồi của bạn.'
        }
        icon={LayoutDashboard}
        tone="brand"
        actions={
          <TrendMonthsSelect
            value={trendMonths}
            onValueChange={setTrendMonths}
          />
        }
      />

      {isNewOrganization && (
        <GettingStartedCard
          bankingLinked={user?.bankingLinked ?? false}
          canConnectBank={hasPermission(
            user?.role ?? null,
            Permission.BANK_CONNECTION_MANAGE,
          )}
        />
      )}

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
              amount={summaryQuery.data.totalOutstanding}
              icon={CircleDollarSign}
              variant="default"
              className="animate-fade-up motion-reduce:animate-none"
            />
            <MetricCard
              label="Công nợ quá hạn"
              description="Công nợ đã vượt ngày đến hạn"
              value={formatVND(summaryQuery.data.totalOverdue)}
              amount={summaryQuery.data.totalOverdue}
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
              empty={summaryQuery.data.totalOutstanding === '0'}
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

          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:160ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-info" />
                  <CardTitle>Xu hướng công nợ {trendMonths} tháng</CardTitle>
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
                  <PieChart className="size-4 text-warning" />
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
          </div>

          {trendQuery.data && (
            <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:240ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-violet-500" />
                  <CardTitle>
                    Hoạt động thanh toán {trendMonths} tháng
                  </CardTitle>
                </div>
                <CardDescription>
                  Tổng số tiền đã thu theo từng tháng trong {trendMonths} tháng
                  gần nhất
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentActivityChart trend={trendQuery.data} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* The grid stretches both cards to the taller one; flex-1 lets an
                empty feed fill that height instead of leaving a blank block. */}
            <Card className="flex flex-col animate-fade-up motion-reduce:animate-none [animation-delay:280ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-success" />
                  <CardTitle>Hoạt động gần đây</CardTitle>
                </div>
                <CardDescription>
                  Các sự kiện mới nhất trong hệ thống
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
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

            <Card className="flex flex-col animate-fade-up motion-reduce:animate-none [animation-delay:320ms]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-destructive" />
                  <CardTitle>Khách hàng quá hạn nhiều nhất</CardTitle>
                </div>
                <CardDescription>
                  Top khách hàng có tổng công nợ quá hạn cao nhất
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                {summaryQuery.data.topOverdueCustomers.length === 0 ? (
                  <EmptyState
                    density="compact"
                    className="flex-1"
                    icon={Users}
                    title="Chưa có khách hàng quá hạn"
                    description="Danh sách sẽ xuất hiện khi có khoản quá hạn cần theo dõi."
                  />
                ) : (
                  <div className="divide-y overflow-hidden rounded-lg border border-border/70">
                    {summaryQuery.data.topOverdueCustomers.map((customer) => (
                      <div
                        key={customer.customerId}
                        className="flex items-center justify-between gap-4 px-3 py-3 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <InitialsAvatar
                            name={customer.customerName}
                            size="sm"
                          />
                          <TruncatedName
                            name={customer.customerName}
                            className="font-medium"
                          />
                        </div>
                        <span className="min-w-0 max-w-[50%] break-all rounded-lg bg-destructive/10 px-2.5 py-1 text-right font-semibold tabular-nums text-destructive">
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
