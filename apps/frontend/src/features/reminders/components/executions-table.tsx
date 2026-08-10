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
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có lần thực thi nào.
      </p>
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
