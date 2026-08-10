import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { formatDate } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useDisconnectConnection } from '../api/use-bank-connections';
import type { BankConnection, BankConnectionStatus } from '../types';

const statusLabels: Record<BankConnectionStatus, string> = {
  PENDING_AUTHORIZATION: 'Chờ cấp quyền',
  ACTIVE: 'Đang hoạt động',
  REQUIRES_REAUTHORIZATION: 'Cần cấp quyền lại',
  REVOKED: 'Đã thu hồi',
  DISCONNECTED: 'Đã ngắt kết nối',
  ERROR: 'Lỗi',
};

export function ConnectionTable({
  connections,
}: {
  connections: BankConnection[];
}) {
  const { user } = useAuth();
  const canManage = hasPermission(
    user?.role ?? null,
    Permission.BANK_CONNECTION_MANAGE,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const disconnectMutation = useDisconnectConnection();

  if (connections.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có kết nối ngân hàng.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ngân hàng</TableHead>
          <TableHead>Số tài khoản</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Đồng bộ gần nhất</TableHead>
          {canManage && <TableHead>Thao tác</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {connections.map((connection) => (
          <TableRow key={connection.id}>
            <TableCell className="font-medium">{connection.bankName}</TableCell>
            <TableCell>{connection.accountNumber}</TableCell>
            <TableCell>
              <Badge
                variant={connection.status === 'ACTIVE' ? 'default' : 'outline'}
              >
                {statusLabels[connection.status]}
              </Badge>
            </TableCell>
            <TableCell>
              {connection.lastSyncAt ? formatDate(connection.lastSyncAt) : '—'}
            </TableCell>
            {canManage && (
              <TableCell>
                {connection.status === 'ACTIVE' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Disconnect bank"
                        onClick={() => setPendingId(connection.id)}
                      >
                        Ngắt kết nối
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Ngắt kết nối ngân hàng?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Dữ liệu đã đồng bộ vẫn được giữ lại.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            if (pendingId) disconnectMutation.mutate(pendingId);
                          }}
                        >
                          Xác nhận
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
