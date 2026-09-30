import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receipt, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/layout/empty-state';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
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
import { getReceivableDisplayName } from '../receivable-label';
import type { Receivable } from '../types';

// Below md each row becomes a 3-column card (checkbox | details | amount) via
// CSS grid, so the same DOM serves both layouts. The status cell spans the
// details + amount columns (grid items may share an area) so wide badges do
// not widen the amount column and squeeze the customer name:
//   [☐] Customer name              19.200.000 ₫
//       INV-001 / Khoản phải thu        Đang thu
//       29/04/2026  Quá hạn
const MOBILE_ROW =
  'max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-1 max-md:py-3';

export function ReceivableTable({
  receivables,
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
  isFiltered = false,
  canCreate = false,
}: {
  receivables: Receivable[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  isFiltered?: boolean;
  canCreate?: boolean;
}) {
  function isBulkEligible(status: Receivable['status']): boolean {
    return (
      status === ReceivableStatus.OPEN ||
      status === ReceivableStatus.PARTIALLY_PAID
    );
  }

  if (receivables.length === 0) {
    return isFiltered ? (
      <EmptyState
        icon={SearchX}
        title="Không có khoản phải thu phù hợp"
        description="Thử đổi từ khóa tìm kiếm hoặc trạng thái lọc."
      />
    ) : (
      <EmptyState
        icon={Receipt}
        title="Chưa có khoản phải thu nào"
        description={
          canCreate
            ? 'Bấm “Tạo khoản phải thu” hoặc “Nhập hóa đơn” ở đầu trang để bắt đầu theo dõi công nợ.'
            : 'Khoản phải thu của tổ chức sẽ hiển thị tại đây.'
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader className="max-md:hidden">
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
          <TableHead className="text-right">Phải thu</TableHead>
          <TableHead className="text-right">Còn lại</TableHead>
          <TableHead>Hạn thanh toán</TableHead>
          <TableHead>Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receivables.map((receivable) => {
          const customerName =
            receivable.customerName ?? 'Chưa có tên khách hàng';

          return (
            <TableRow key={receivable.id} className={MOBILE_ROW}>
              <TableCell className="max-md:col-start-1 max-md:row-span-3 max-md:row-start-1 max-md:self-start max-md:p-0">
                <Checkbox
                  aria-label={`Chọn ${getReceivableDisplayName(receivable.invoiceNumber)}`}
                  checked={selectedIds.includes(receivable.id)}
                  disabled={!isBulkEligible(receivable.status)}
                  onCheckedChange={() => onToggle(receivable.id)}
                />
              </TableCell>
              <TableCell className="whitespace-nowrap max-md:col-start-2 max-md:row-start-2 max-md:justify-self-start max-md:p-0 max-md:text-xs">
                <Link
                  to={`/receivables/${receivable.id}`}
                  className={
                    receivable.invoiceNumber
                      ? 'font-medium text-primary pointer-hover:hover:underline'
                      : 'font-medium text-muted-foreground pointer-hover:hover:underline'
                  }
                >
                  {getReceivableDisplayName(receivable.invoiceNumber)}
                </Link>
                {!receivable.invoiceNumber && (
                  <p className="text-xs text-muted-foreground max-md:hidden">
                    Không có hóa đơn · tạo {formatDate(receivable.createdAt)}
                  </p>
                )}
              </TableCell>
              <TableCell className="max-w-72 max-md:col-start-2 max-md:row-start-1 max-md:max-w-none max-md:p-0">
                <div className="flex min-w-0 items-center gap-2">
                  <InitialsAvatar
                    name={customerName}
                    size="sm"
                    className="max-md:hidden"
                  />
                  <span
                    className="block min-w-0 truncate max-md:font-medium"
                    title={customerName}
                  >
                    {customerName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums max-md:hidden">
                {formatVND(receivable.originalAmount)}
              </TableCell>
              <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums max-md:col-start-3 max-md:row-start-1 max-md:p-0">
                {formatVND(receivable.remainingAmount)}
              </TableCell>
              <TableCell className="max-md:col-span-2 max-md:col-start-2 max-md:row-start-3 max-md:p-0 max-md:text-xs max-md:text-muted-foreground">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {formatDate(receivable.dueDate)}
                  {receivable.isOverdue && (
                    <Badge variant="destructive">Quá hạn</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="max-md:col-span-2 max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end max-md:p-0">
                <div className="flex flex-wrap gap-2 max-md:justify-end">
                  <ReceivableStatusBadge status={receivable.status} />
                  {receivable.isDisputed && (
                    <Badge variant="outline">Tranh chấp</Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
