import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgingReport, useDashboardSummary } from '../api/use-reports';
import { AgingChart } from '../components/aging-chart';
import { AgingTable } from '../components/aging-table';
import { DashboardSummary } from '../components/dashboard-summary';

export function ReportsPage() {
  const summaryQuery = useDashboardSummary();
  const agingQuery = useAgingReport();

  if (summaryQuery.isPending || agingQuery.isPending) {
    return <p>Đang tải báo cáo…</p>;
  }

  if (summaryQuery.isError || agingQuery.isError) {
    return <p className="text-destructive">Không thể tải dữ liệu báo cáo.</p>;
  }

  if (!summaryQuery.data || !agingQuery.data) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">PHÂN TÍCH</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Báo cáo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi công nợ, tuổi nợ và khả năng thu tiền.
        </p>
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
            <AgingChart report={agingQuery.data} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
