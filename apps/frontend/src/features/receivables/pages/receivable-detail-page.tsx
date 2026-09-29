import { Permission } from '@casso-ar/shared-types';
import { CreditCard, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '@/components/layout/back-link';
import { HeaderIcon } from '@/components/layout/header-icon';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/auth-context';
import { formatDate, formatDateTime, formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useReceivable } from '../api/use-receivables';
import { CancelDialog } from '../components/cancel-dialog';
import { DisputeDialog } from '../components/dispute-dialog';
import { ReceivableAuditTrail } from '../components/receivable-audit-trail';
import { ReceivablePayments } from '../components/receivable-payments';
import { ReceivableTasks } from '../components/receivable-tasks';
import { ReceivableTimeline } from '../components/receivable-timeline';
import { WriteOffDialog } from '../components/write-off-dialog';
import { getReceivableDisplayName } from '../receivable-label';

export function ReceivableDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { searchParams, setParam } = useUrlQueryParams();
  const { user } = useAuth();
  const canReadAudit = hasPermission(
    user?.role ?? null,
    Permission.AUDIT_LOG_READ,
  );
  const { data: receivable, isPending, isError } = useReceivable(id);
  const allowedTabs = canReadAudit
    ? ['payments', 'activity', 'tasks', 'audit']
    : ['payments', 'activity', 'tasks'];
  const activeTab = allowedTabs.includes(searchParams.get('tab') ?? '')
    ? (searchParams.get('tab') as 'payments' | 'activity' | 'tasks' | 'audit')
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
  const customerName = receivable.customerName ?? 'Chưa có tên khách hàng';

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <BackLink to="/receivables">Công nợ</BackLink>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <HeaderIcon icon={Receipt} />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {getReceivableDisplayName(receivable.invoiceNumber)}
                </h1>
                {!receivable.invoiceNumber && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Không có hóa đơn
                  </Badge>
                )}
                <ReceivableStatusBadge status={receivable.status} />
                {receivable.isDisputed && (
                  <Badge variant="destructive">Tranh chấp</Badge>
                )}
                {receivable.isOverdue && (
                  <Badge variant="destructive">Quá hạn</Badge>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <Link
                  to={`/customers/${receivable.customerId}`}
                  className="font-medium text-foreground pointer-hover:hover:underline"
                >
                  {customerName}
                </Link>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    receivable.isOverdue
                      ? 'font-medium text-destructive'
                      : undefined
                  }
                >
                  Hạn {formatDate(receivable.dueDate)}
                </span>
                <span aria-hidden="true">·</span>
                <span>Tạo lúc {formatDateTime(receivable.createdAt)}</span>
              </p>
            </div>
          </div>
          {!terminal && (
            <div className="flex flex-wrap gap-2 lg:shrink-0">
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
      </div>

      {/* One summary card: amounts + collection progress. The old separate
          "Tiến độ thu hồi" card repeated every amount and sat half empty. */}
      <Card className="gap-4 py-5">
        <CardContent className="space-y-5 px-5">
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Nguyên giá</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums md:text-xl">
                {formatVND(receivable.originalAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Đã thu</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums md:text-xl">
                {formatVND(receivable.paidAmount)}
              </dd>
            </div>
            <div className="col-span-2 md:col-span-1">
              <dt className="text-sm font-medium text-primary">Còn lại</dt>
              <dd className="mt-1 text-2xl font-semibold text-primary tabular-nums">
                {formatVND(receivable.remainingAmount)}
              </dd>
            </div>
          </dl>
          <div className="space-y-2">
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
            <p className="text-sm font-medium text-primary">
              {paidPercentage}% đã thu
            </p>
          </div>
        </CardContent>
      </Card>
      <Tabs
        className="gap-3"
        value={activeTab}
        onValueChange={(value) => setParam('tab', value)}
      >
        <TabsList>
          <TabsTrigger value="payments">Thanh toán</TabsTrigger>
          <TabsTrigger value="activity">Hoạt động</TabsTrigger>
          <TabsTrigger value="tasks">Công việc</TabsTrigger>
          {canReadAudit && (
            <TabsTrigger value="audit">Nhật ký kiểm toán</TabsTrigger>
          )}
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
        {canReadAudit && (
          <TabsContent
            value="audit"
            className="min-h-32 rounded-xl border bg-card p-5"
          >
            <ReceivableAuditTrail receivableId={receivable.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
