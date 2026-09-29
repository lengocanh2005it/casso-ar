import { BarChart3, PieChart, TrendingUp, Users } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeading } from '@/components/layout/page-heading';
import { CardPagination } from '@/components/shared/card-pagination';
import { TrendMonthsSelect } from '@/components/shared/trend-months-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCsvExport } from '@/lib/use-csv-export';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { exportAgingReportCsv } from '../api/reports-api';
import {
  useAgingReport,
  useCustomerAging,
  useDashboardSummary,
  useReportsTrend,
} from '../api/use-reports';
import { AgingTable } from '../components/aging-table';
import {
  AGING_BUCKET_ORDER,
  type AgingBucketFilter,
  CustomerAgingFilters,
} from '../components/customer-aging-filters';
import { CustomerAgingTable } from '../components/customer-aging-table';
import { DashboardSummary } from '../components/dashboard-summary';
import { parseTrendMonths } from '../trend-months';
import type { AgingBucket, TrendMonths } from '../types';

const CUSTOMER_AGING_LIMIT = 20;

const agingChartImport = import('../components/aging-chart');
const AgingChart = lazy(() =>
  agingChartImport.then((module) => ({ default: module.AgingChart })),
);
const reportsTrendChartImport = import('../components/reports-trend-chart');
const ReportsTrendChart = lazy(() =>
  reportsTrendChartImport.then((module) => ({
    default: module.ReportsTrendChart,
  })),
);

function ChartLoadingFallback() {
  return (
    <div
      role="status"
      aria-label="Đang tải biểu đồ"
      className="flex h-80 items-center justify-center text-sm text-muted-foreground"
    >
      Đang tải biểu đồ…
    </div>
  );
}

function isAgingBucket(value: string | null): value is AgingBucket {
  return AGING_BUCKET_ORDER.some((bucket) => bucket === value);
}

export function ReportsPage() {
  const { isExporting, exportCsv } = useCsvExport();
  const { searchParams, patch } = useUrlQueryParams();
  const summaryQuery = useDashboardSummary();
  const agingQuery = useAgingReport();

  const agingSearch = searchParams.get('agingSearch') ?? '';
  const rawBucket = searchParams.get('agingBucket');
  const agingBucket: AgingBucketFilter = isAgingBucket(rawBucket)
    ? rawBucket
    : 'ALL';
  const rawPage = Number(searchParams.get('agingPage') ?? '1');
  const agingPage = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const trendMonths = parseTrendMonths(searchParams.get('trendMonths'), 12);

  const customerAgingQuery = useCustomerAging({
    page: agingPage,
    limit: CUSTOMER_AGING_LIMIT,
    search: agingSearch || undefined,
    bucket: agingBucket === 'ALL' ? undefined : agingBucket,
  });
  const trendQuery = useReportsTrend(trendMonths);
  const agingTotalPages = customerAgingQuery.data
    ? Math.max(
        1,
        Math.ceil(
          customerAgingQuery.data.total / customerAgingQuery.data.limit,
        ),
      )
    : 1;

  function setAgingSearch(value: string) {
    patch((next) => {
      if (value) {
        next.set('agingSearch', value);
      } else {
        next.delete('agingSearch');
      }
      next.delete('agingPage');
    });
  }

  function setAgingBucket(value: AgingBucketFilter) {
    patch((next) => {
      if (value === 'ALL') {
        next.delete('agingBucket');
      } else {
        next.set('agingBucket', value);
      }
      next.delete('agingPage');
    });
  }

  function setAgingPage(nextPage: number) {
    patch((next) => {
      next.set('agingPage', String(nextPage));
    });
  }

  useEffect(() => {
    if (
      !customerAgingQuery.data ||
      customerAgingQuery.data.total === 0 ||
      agingPage <= agingTotalPages
    ) {
      return;
    }

    patch((next) => {
      next.set('agingPage', String(agingTotalPages));
    });
  }, [agingPage, agingTotalPages, customerAgingQuery.data, patch]);

  function setTrendMonths(months: TrendMonths) {
    patch((next) => {
      next.set('trendMonths', String(months));
    });
  }

  if (summaryQuery.isPending || agingQuery.isPending) {
    return (
      <p role="status" aria-live="polite">
        Đang tải báo cáo…
      </p>
    );
  }

  if (summaryQuery.isError || agingQuery.isError) {
    return (
      <p role="alert" aria-live="polite" className="text-destructive">
        Không thể tải dữ liệu báo cáo.
      </p>
    );
  }

  if (!summaryQuery.data || !agingQuery.data) return null;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="PHÂN TÍCH"
        title="Báo cáo"
        description="Theo dõi công nợ, tuổi nợ và khả năng thu tiền."
        icon={BarChart3}
        tone="info"
        actions={
          <Button
            variant="outline"
            disabled={isExporting}
            onClick={() =>
              exportCsv(
                () => exportAgingReportCsv().then((csv) => ({ csv })),
                'bao-cao-tuoi-no.csv',
              )
            }
          >
            {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
          </Button>
        }
      />
      <DashboardSummary summary={summaryQuery.data} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChart aria-hidden="true" className="size-4 text-info" />
              <CardTitle>Phân bổ tuổi nợ</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <AgingTable
              report={agingQuery.data}
              totalOutstanding={summaryQuery.data.totalOutstanding}
            />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 aria-hidden="true" className="size-4 text-warning" />
              <CardTitle>Biểu đồ tuổi nợ</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartLoadingFallback />}>
              <AgingChart report={agingQuery.data} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-4 text-info" />
            <CardTitle>Công nợ theo khách hàng</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CustomerAgingFilters
            search={agingSearch}
            bucket={agingBucket}
            onSearchChange={setAgingSearch}
            onBucketChange={setAgingBucket}
          />
          {customerAgingQuery.isPending && (
            <p role="status" aria-live="polite">
              Đang tải công nợ khách hàng…
            </p>
          )}
          {customerAgingQuery.isError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải báo cáo công nợ khách hàng.
            </p>
          )}
          {customerAgingQuery.data &&
            customerAgingQuery.data.total === 0 &&
            customerAgingQuery.data.items.length === 0 && (
              <EmptyState
                density="compact"
                icon={Users}
                {...(agingSearch || agingBucket !== 'ALL'
                  ? {
                      title: 'Không có khách hàng phù hợp',
                      description:
                        'Thử đổi từ khóa tìm kiếm hoặc nhóm tuổi nợ.',
                    }
                  : {
                      title: 'Chưa có khách hàng còn công nợ',
                      description:
                        'Khách hàng có khoản phải thu chưa thu đủ sẽ xuất hiện tại đây.',
                    })}
              />
            )}
          {customerAgingQuery.data &&
            customerAgingQuery.data.items.length > 0 && (
              <CustomerAgingTable page={customerAgingQuery.data} />
            )}
          {customerAgingQuery.data && (
            <CardPagination
              page={customerAgingQuery.data.page}
              totalPages={agingTotalPages}
              onPageChange={setAgingPage}
            />
          )}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <TrendingUp
              aria-hidden="true"
              className="size-4 shrink-0 text-success"
            />
            <CardTitle>Xu hướng công nợ và thu hồi</CardTitle>
          </div>
          <TrendMonthsSelect
            value={trendMonths}
            onValueChange={setTrendMonths}
          />
        </CardHeader>
        <CardContent>
          {trendQuery.isPending && (
            <p role="status" aria-live="polite">
              Đang tải xu hướng…
            </p>
          )}
          {trendQuery.isError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải dữ liệu xu hướng.
            </p>
          )}
          {trendQuery.data && (
            <Suspense fallback={<ChartLoadingFallback />}>
              <ReportsTrendChart trend={trendQuery.data} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
