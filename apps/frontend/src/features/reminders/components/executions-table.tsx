import { History } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { ReminderExecution } from '../types';

function statusLabel(status: ReminderExecution['status']): string {
  return {
    PENDING: 'Đang chờ',
    SENT: 'Đã gửi',
    FAILED: 'Thất bại',
    SKIPPED: 'Đã bỏ qua',
  }[status];
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
          <TableHead>Mã khoản phải thu</TableHead>
          <TableHead>Kênh</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Thời điểm gửi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {executions.map((execution) => (
          <TableRow key={execution.id}>
            <TableCell className="font-medium">
              {execution.receivableId}
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
                      ? 'border-warning/40 bg-warning/10 text-warning-foreground'
                      : undefined
                }
              >
                {statusLabel(execution.status)}
              </Badge>
            </TableCell>
            <TableCell>
              {execution.sentAt ? formatDate(execution.sentAt) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
