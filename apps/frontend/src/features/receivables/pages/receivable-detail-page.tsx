import { CalendarClock, CreditCard, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { HeaderIcon } from '@/components/layout/header-icon';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatVND } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useReceivable } from '../api/use-receivables';
import { CancelDialog } from '../components/cancel-dialog';
import { DisputeDialog } from '../components/dispute-dialog';
import { ReceivablePayments } from '../components/receivable-payments';
import { ReceivableTasks } from '../components/receivable-tasks';
import { ReceivableTimeline } from '../components/receivable-timeline';
import { WriteOffDialog } from '../components/write-off-dialog';

export function ReceivableDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { searchParams, setParam } = useUrlQueryParams();
  const { data: receivable, isPending, isError } = useReceivable(id);
  const activeTab = ['payments', 'activity', 'tasks'].includes(
    searchParams.get('tab') ?? '',
  )
    ? (searchParams.get('tab') as 'payments' | 'activity' | 'tasks')
    : 'payments';

  if (isPending)
    return (
      <p role="status" aria-live="polite">
        Đang tải…
      </p>
    );
  if (isError || !receivable) {
    return (
      <p role="alert" aria-live="polite" className="text-destructive">
        Không tìm thấy khoản phải thu.
      </p>
    );
  }

  const terminal = ['PAID', 'WRITTEN_OFF', 'CANCELLED'].includes(
    receivable.status,
  );
  const paidPercentage =
    receivable.originalAmount > 0
      ? Math.min(
          100,
          Math.round((receivable.paidAmount / receivable.originalAmount) * 100),
        )
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/receivables"
            className="text-sm text-primary pointer-hover:hover:underline"
          >
            ← Công nợ
          </Link>
          <HeaderIcon icon={Receipt} />
          <h1 className="text-2xl font-semibold" title={receivable.id}>
            {receivable.invoiceNumber ?? `#${receivable.id.slice(0, 8)}`}
          </h1>
          <ReceivableStatusBadge status={receivable.status} />
          {receivable.isDisputed && (
            <Badge variant="destructive">Tranh chấp</Badge>
          )}
          {receivable.isOverdue && <Badge variant="destructive">Quá hạn</Badge>}
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
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="gap-3 py-4">
          <CardHeader className="gap-1 px-5">
            <CardTitle className="text-sm text-muted-foreground">
              Nguyên giá
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xl font-semibold tabular-nums">
            {formatVND(receivable.originalAmount)}
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="gap-1 px-5">
            <CardTitle className="text-sm text-muted-foreground">
              Đã thu
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xl font-semibold tabular-nums">
            {formatVND(receivable.paidAmount)}
          </CardContent>
        </Card>
        <Card className="gap-3 border-primary/20 bg-primary/5 py-4">
          <CardHeader className="gap-1 px-5">
            <CardTitle className="text-sm text-primary">Còn lại</CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xl font-semibold text-primary tabular-nums">
            {formatVND(receivable.remainingAmount)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <Card className="gap-4 py-5">
          <CardHeader className="gap-1 px-5">
            <CardTitle className="text-base">Tiến độ thu hồi</CardTitle>
            <p className="text-sm text-muted-foreground">
              Đã thu {formatVND(receivable.paidAmount)} trên tổng{' '}
              {formatVND(receivable.originalAmount)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Tiến độ thu hồi"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={paidPercentage}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${paidPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-primary">
                {paidPercentage}% đã thu
              </span>
              <span className="text-muted-foreground">
                Còn {formatVND(receivable.remainingAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="gap-1 px-5">
            <CardTitle className="text-base">Thông tin khoản thu</CardTitle>
            <p className="text-sm text-muted-foreground">
              Các mốc quan trọng của khoản công nợ
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Hạn thanh toán</p>
              <p
                className={
                  receivable.isOverdue
                    ? 'mt-1 font-medium text-destructive'
                    : 'mt-1 font-medium'
                }
              >
                {formatDate(receivable.dueDate)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Ngày tạo</p>
              <p className="mt-1 font-medium">
                {formatDate(receivable.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <CalendarClock
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
              <p>
                {receivable.isOverdue
                  ? 'Khoản thu đang quá hạn thanh toán.'
                  : 'Khoản thu đang trong thời hạn thanh toán.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        className="gap-3"
        value={activeTab}
        onValueChange={(value) => setParam('tab', value)}
      >
        <TabsList>
          <TabsTrigger value="payments">Thanh toán</TabsTrigger>
          <TabsTrigger value="activity">Hoạt động</TabsTrigger>
          <TabsTrigger value="tasks">Công việc</TabsTrigger>
        </TabsList>
        <TabsContent
          value="payments"
          className="min-h-32 rounded-xl border bg-card p-5"
        >
          {receivable.allocations?.length ? (
            <ReceivablePayments receivableId={receivable.id} />
          ) : (
            <div className="flex min-h-20 flex-col items-center justify-center gap-2 text-center">
              <CreditCard
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
              <p className="text-sm font-medium">Chưa có khoản thanh toán</p>
              <p className="text-sm text-muted-foreground">
                Các khoản thu được khớp vào công nợ sẽ hiển thị tại đây.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent
          value="activity"
          className="min-h-32 rounded-xl border bg-card p-5"
        >
          <ReceivableTimeline receivableId={receivable.id} />
        </TabsContent>
        <TabsContent
          value="tasks"
          className="min-h-32 rounded-xl border bg-card p-5"
        >
          <ReceivableTasks receivableId={receivable.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
