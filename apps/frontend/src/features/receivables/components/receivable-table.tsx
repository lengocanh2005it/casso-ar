import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HeaderIcon } from '@/components/layout/header-icon';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
}: {
  receivables: Receivable[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
}) {
  function isBulkEligible(status: Receivable['status']): boolean {
    return (
      status === ReceivableStatus.OPEN ||
      status === ReceivableStatus.PARTIALLY_PAID
    );
  }

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
          <TableHead className="w-10">
            <Checkbox
              aria-label="Chọn tất cả"
              checked={allSelected}
              onCheckedChange={onToggleAll}
            />
          </TableHead>
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
            <TableCell className="max-w-48 break-words">
              <Checkbox
                aria-label={`Chọn ${receivable.invoiceNumber ?? receivable.id}`}
                checked={selectedIds.includes(receivable.id)}
                disabled={!isBulkEligible(receivable.status)}
                onCheckedChange={() => onToggle(receivable.id)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <HeaderIcon icon={Receipt} />
                <Link
                  to={`/receivables/${receivable.id}`}
                  className={
                    receivable.invoiceNumber
                      ? 'font-medium text-primary pointer-hover:hover:underline'
                      : 'font-medium text-muted-foreground italic pointer-hover:hover:underline'
                  }
                >
                  {receivable.invoiceNumber ?? 'Không có hóa đơn'}
                </Link>
              </div>
            </TableCell>
            <TableCell className="max-w-56 break-words">
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
