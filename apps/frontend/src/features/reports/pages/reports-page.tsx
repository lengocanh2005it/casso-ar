import { lazy, Suspense, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { AgingBucket, TrendMonths } from '../types';

const CUSTOMER_AGING_LIMIT = 20;
const TREND_MONTHS: TrendMonths[] = [3, 6, 12];

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

function isTrendMonths(value: number): value is TrendMonths {
  return TREND_MONTHS.some((months) => months === value);
}

function parseTrendMonths(value: string | null): TrendMonths {
  const parsed = Number(value ?? '12');
  return isTrendMonths(parsed) ? parsed : 12;
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
  const trendMonths = parseTrendMonths(searchParams.get('trendMonths'));

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">PHÂN TÍCH</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Báo cáo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi công nợ, tuổi nợ và khả năng thu tiền.
          </p>
        </div>
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
      </div>
      <DashboardSummary summary={summaryQuery.data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Phân bổ tuổi nợ</CardTitle>
          </CardHeader>
          <CardContent>
            <AgingTable
              report={agingQuery.data}
              totalOutstanding={summaryQuery.data.totalOutstanding}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ tuổi nợ</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartLoadingFallback />}>
              <AgingChart report={agingQuery.data} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Công nợ theo khách hàng</CardTitle>
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
              <p className="text-muted-foreground">
                Không có khách hàng nào có công nợ hiện tại.
              </p>
            )}
          {customerAgingQuery.data &&
            customerAgingQuery.data.items.length > 0 && (
              <CustomerAgingTable page={customerAgingQuery.data} />
            )}
          {customerAgingQuery.data && customerAgingQuery.data.total > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Trang {customerAgingQuery.data.page} / {agingTotalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={agingPage === 1}
                  onClick={() => setAgingPage(agingPage - 1)}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={agingPage >= agingTotalPages}
                  onClick={() => setAgingPage(agingPage + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Xu hướng công nợ và thu hồi</CardTitle>
          <Select
            value={String(trendMonths)}
            onValueChange={(value) => {
              const months = Number(value);
              if (isTrendMonths(months)) {
                setTrendMonths(months);
              }
            }}
          >
            <SelectTrigger aria-label="Khoảng thời gian" className="w-40">
              <SelectValue placeholder="12 tháng" />
            </SelectTrigger>
            <SelectContent>
              {TREND_MONTHS.map((months) => (
                <SelectItem key={months} value={String(months)}>
                  {months} tháng
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
