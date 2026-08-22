import { BarChart3 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useAdminAiUsage, useAdminAiUsageTrend } from '../api/use-admin';

const adminUsageChartsImport = import('../components/admin-usage-charts');
const AdminUsageCharts = lazy(() =>
  adminUsageChartsImport.then((module) => ({
    default: module.AdminUsageCharts,
  })),
);

function last7DayRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function ChartLoadingFallback({
  hasTopOrganizations,
  hasTrend,
}: {
  hasTopOrganizations: boolean;
  hasTrend: boolean;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-balance leading-none font-semibold">
            Top organizations theo usage (7 ngày)
          </h2>
          <CardDescription>
            Các tổ chức gọi AI nhiều nhất trong 7 ngày qua
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {hasTopOrganizations
              ? 'Đang tải biểu đồ…'
              : 'Chưa có dữ liệu usage.'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-balance leading-none font-semibold">
            Xu hướng usage theo ngày (7 ngày)
          </h2>
          <CardDescription>
            Số lượt gọi AI theo từng ngày trong 7 ngày qua
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {hasTrend ? 'Đang tải biểu đồ…' : 'Chưa có dữ liệu usage.'}
          </p>
        </CardContent>
      </Card>
    </>
  );
}

export function AdminDashboardPage() {
  const [dateRange] = useState(() => last7DayRange());
  const usageQuery = useAdminAiUsage(dateRange.from, dateRange.to);
  const trendQuery = useAdminAiUsageTrend(dateRange.from, dateRange.to);
  const topOrgs = usageQuery.data?.items ?? [];
  const trend = trendQuery.data?.items ?? [];
  const isLoading = usageQuery.isPending || trendQuery.isPending;
  const error = usageQuery.isError || trendQuery.isError;

  function handleRetry() {
    void Promise.all([usageQuery.refetch(), trendQuery.refetch()]);
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Đang tải dữ liệu…"
        className="flex min-h-48 items-center justify-center rounded-xl border bg-card"
      >
        <Spinner className="size-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          Không thể tải dữ liệu usage. Vui lòng thử lại.
        </p>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="ADMIN CONSOLE"
        title="Admin overview"
        description="Theo dõi usage AI trên toàn bộ tổ chức."
        icon={BarChart3}
        tone="info"
      />
      <Suspense
        fallback={
          <ChartLoadingFallback
            hasTopOrganizations={topOrgs.length > 0}
            hasTrend={trend.length > 0}
          />
        }
      >
        <AdminUsageCharts topOrganizations={topOrgs} trend={trend} />
      </Suspense>
    </div>
  );
}
