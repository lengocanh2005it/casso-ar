import { Link } from 'react-router-dom';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatVND } from '@/lib/format';
import type { Receivable } from '../types';

export function ReceivableTable({
  receivables,
}: {
  receivables: Receivable[];
}) {
  if (receivables.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có khoản phải thu phù hợp.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hóa đơn</TableHead>
          <TableHead>Khách hàng</TableHead>
          <TableHead>Phải thu</TableHead>
          <TableHead>Còn lại</TableHead>
          <TableHead>Hạn thanh toán</TableHead>
          <TableHead>Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receivables.map((receivable) => (
          <TableRow key={receivable.id}>
            <TableCell>
              <Link
                to={`/receivables/${receivable.id}`}
                className="font-medium text-primary hover:underline"
              >
                {receivable.invoiceNumber ?? 'Không có hóa đơn'}
              </Link>
            </TableCell>
            <TableCell>
              {receivable.customerName ?? receivable.customerId}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatVND(receivable.originalAmount)}
            </TableCell>
            <TableCell className="tabular-nums font-medium">
              {formatVND(receivable.remainingAmount)}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                {formatDate(receivable.dueDate)}
                {receivable.isOverdue && (
                  <Badge variant="destructive">Quá hạn</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                <ReceivableStatusBadge status={receivable.status} />
                {receivable.isDisputed && (
                  <Badge variant="outline">Tranh chấp</Badge>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
