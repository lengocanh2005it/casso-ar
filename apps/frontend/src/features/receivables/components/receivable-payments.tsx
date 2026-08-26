import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { useOrganizationMembers } from '@/features/settings/api/use-settings';
import { actorLabel } from '@/lib/actor-label';
import { formatDateTime, formatVND } from '@/lib/format';
import { useReceivable } from '../api/use-receivables';

export function ReceivablePayments({ receivableId }: { receivableId: string }) {
  const { user } = useAuth();
  const { data } = useReceivable(receivableId);
  const membersQuery = useOrganizationMembers(user?.organizationId);
  const members = membersQuery.data?.items ?? [];
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
              <div className="space-y-1">
                <p className="font-medium">
                  {allocation.payerName ?? 'Khoản thanh toán'}
                </p>
                {allocation.bankTransactionId && (
                  <p className="text-xs text-muted-foreground">
                    Mã giao dịch ngân hàng:{' '}
                    <TruncatedCopyId id={allocation.bankTransactionId} />
                  </p>
                )}
                <TruncatedCopyId id={allocation.paymentId} />
              </div>
            </TableCell>
            <TableCell>{formatVND(allocation.allocatedAmount)}</TableCell>
            <TableCell>{formatDateTime(allocation.allocatedAt)}</TableCell>
            <TableCell>
              {allocation.allocatedByUserId === null
                ? 'Tự động khớp'
                : actorLabel(allocation.allocatedByUserId, members)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
