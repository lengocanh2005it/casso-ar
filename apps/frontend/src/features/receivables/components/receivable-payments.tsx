import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatVND } from '@/lib/format';
import { useReceivable } from '../api/use-receivables';

export function ReceivablePayments({ receivableId }: { receivableId: string }) {
  const { data } = useReceivable(receivableId);
  const allocations = data?.allocations ?? [];

  if (allocations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Chưa có khoản thanh toán.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Thanh toán</TableHead>
          <TableHead>Số tiền</TableHead>
          <TableHead>Ngày</TableHead>
          <TableHead>Nguồn</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allocations.map((allocation) => (
          <TableRow key={allocation.id}>
            <TableCell>
              <TruncatedCopyId id={allocation.paymentId} />
            </TableCell>
            <TableCell>{formatVND(allocation.allocatedAmount)}</TableCell>
            <TableCell>{formatDateTime(allocation.allocatedAt)}</TableCell>
            <TableCell>
              {allocation.allocatedByUserId === null ? (
                'Tự động khớp'
              ) : (
                <TruncatedCopyId id={allocation.allocatedByUserId} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
