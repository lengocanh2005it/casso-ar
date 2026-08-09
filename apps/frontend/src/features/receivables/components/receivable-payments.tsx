import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatVND } from '@/lib/format';
import { useReceivable } from '../api/use-receivables';

export function ReceivablePayments({ receivableId }: { receivableId: string }) {
  const { data } = useReceivable(receivableId);
  const allocations = data?.allocations ?? [];

  if (allocations.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Payment</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allocations.map((allocation) => (
          <TableRow key={allocation.id}>
            <TableCell>{allocation.paymentId}</TableCell>
            <TableCell>{formatVND(allocation.allocatedAmount)}</TableCell>
            <TableCell>{formatDate(allocation.allocatedAt)}</TableCell>
            <TableCell>
              {allocation.allocatedByUserId === null
                ? 'Automatically matched'
                : allocation.allocatedByUserId}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
