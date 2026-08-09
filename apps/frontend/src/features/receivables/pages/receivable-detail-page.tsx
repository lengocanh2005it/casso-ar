import { Link, useParams } from 'react-router-dom';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatVND } from '@/lib/format';
import { useReceivable } from '../api/use-receivables';
import { CancelDialog } from '../components/cancel-dialog';
import { DisputeDialog } from '../components/dispute-dialog';
import { ReceivablePayments } from '../components/receivable-payments';
import { ReceivableTasks } from '../components/receivable-tasks';
import { ReceivableTimeline } from '../components/receivable-timeline';
import { WriteOffDialog } from '../components/write-off-dialog';

export function ReceivableDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: receivable, isPending, isError } = useReceivable(id);

  if (isPending) return <p>Loading…</p>;
  if (isError || !receivable) {
    return <p className="text-destructive">Không tìm thấy khoản phải thu.</p>;
  }

  const terminal = ['PAID', 'WRITTEN_OFF', 'CANCELLED'].includes(
    receivable.status,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/receivables"
            className="text-sm text-primary hover:underline"
          >
            ← Receivables
          </Link>
          <h1 className="text-2xl font-semibold">{receivable.id}</h1>
          <ReceivableStatusBadge status={receivable.status} />
          {receivable.isDisputed && (
            <Badge variant="destructive">Disputed</Badge>
          )}
          {receivable.isOverdue && (
            <Badge className="bg-red-100 text-red-700">Overdue</Badge>
          )}
        </div>
        {!terminal && (
          <div className="flex flex-wrap gap-2">
            <DisputeDialog
              receivableId={receivable.id}
              isDisputed={receivable.isDisputed}
              disputeId={receivable.disputeId}
            />
            <CancelDialog receivableId={receivable.id} />
            <WriteOffDialog receivableId={receivable.id} />
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Original</CardTitle>
          </CardHeader>
          <CardContent className="tabular-nums">
            {formatVND(receivable.originalAmount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Paid</CardTitle>
          </CardHeader>
          <CardContent className="tabular-nums">
            {formatVND(receivable.paidAmount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Remaining</CardTitle>
          </CardHeader>
          <CardContent className="tabular-nums">
            {formatVND(receivable.remainingAmount)}
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Due: {formatDate(receivable.dueDate)}
      </p>
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="payments">
          <ReceivablePayments receivableId={receivable.id} />
        </TabsContent>
        <TabsContent value="activity">
          <ReceivableTimeline receivableId={receivable.id} />
        </TabsContent>
        <TabsContent value="tasks">
          <ReceivableTasks receivableId={receivable.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
