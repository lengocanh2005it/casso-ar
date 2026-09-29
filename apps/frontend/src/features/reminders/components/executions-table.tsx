import { History } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getReceivableDisplayName } from '@/features/receivables/receivable-label';
import { formatDateTime } from '@/lib/format';
import type { ReminderExecution } from '../types';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chờ',
  SENT: 'Đã gửi',
  FAILED: 'Thất bại',
  SKIPPED: 'Đã bỏ qua',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? 'Trạng thái khác';
}

export function ExecutionsTable({
  executions,
}: {
  executions: ReminderExecution[];
}) {
  if (executions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Chưa có lần thực thi nào"
        description="Lịch sử gửi email nhắc sẽ xuất hiện tại đây."
        density="compact"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Khoản phải thu</TableHead>
          <TableHead>Kênh</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Thời điểm gửi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {executions.map((execution) => {
          const receivableLabel = execution.customerName
            ? `${getReceivableDisplayName(execution.invoiceNumber)} — ${execution.customerName}`
            : getReceivableDisplayName(execution.invoiceNumber);

          return (
            <TableRow key={execution.id}>
              <TableCell className="font-medium">
                <p>{receivableLabel}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  Mã kỹ thuật: <TruncatedCopyId id={execution.receivableId} />
                </p>
              </TableCell>
              <TableCell>Email</TableCell>
              <TableCell>
                <Badge
                  variant={
                    execution.status === 'SENT'
                      ? 'default'
                      : execution.status === 'FAILED'
                        ? 'destructive'
                        : 'outline'
                  }
                  className={
                    execution.status === 'SENT'
                      ? 'bg-success text-success-foreground'
                      : execution.status === 'PENDING'
                        ? 'border-warning/40 bg-warning/10 text-warning-strong'
                        : undefined
                  }
                >
                  {statusLabel(execution.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {execution.sentAt ? formatDateTime(execution.sentAt) : '—'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
