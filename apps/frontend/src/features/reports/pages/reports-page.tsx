import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { downloadCsv } from '@/lib/download-csv';
import { hasPermission } from '@/lib/rbac';
import { exportAgingReportCsv } from '../api/reports-api';
import { useAgingReport, useDashboardSummary } from '../api/use-reports';
import { AgingChart } from '../components/aging-chart';
import { AgingTable } from '../components/aging-table';
import { DashboardSummary } from '../components/dashboard-summary';

export function ReportsPage() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const summaryQuery = useDashboardSummary();
  const agingQuery = useAgingReport();
  const canExport = hasPermission(user?.role ?? null, Permission.REPORT_READ);

  async function exportCsv() {
    setIsExporting(true);
    try {
      const csv = await exportAgingReportCsv();
      downloadCsv(csv, 'bao-cao-tuoi-no.csv');
    } catch {
      toast.error('Không thể xuất CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  if (summaryQuery.isPending || agingQuery.isPending) {
    return <p>Đang tải báo cáo…</p>;
  }

  if (summaryQuery.isError || agingQuery.isError) {
    return <p className="text-destructive">Không thể tải dữ liệu báo cáo.</p>;
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
        {canExport && (
          <Button variant="outline" disabled={isExporting} onClick={exportCsv}>
            {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
          </Button>
        )}
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
