import { Permission } from '@casso-ledger/shared-types';
import { Fragment, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  useDisconnectConnection,
  usePreviewCassoFlowAuthorizationRotation,
  useRotateCassoFlowAuthorization,
} from '../api/use-bank-connections';
import type { BankConnection, BankConnectionStatus } from '../types';
import { CassoFlowAccountPicker } from './casso-flow-account-picker';
import { RevealApiKeyDialog } from './reveal-api-key-dialog';

const statusLabels: Record<BankConnectionStatus, string> = {
  PENDING_AUTHORIZATION: 'Chờ cấp quyền',
  ACTIVE: 'Đang hoạt động',
  REQUIRES_REAUTHORIZATION: 'Cần cấp quyền lại',
  REVOKED: 'Đã thu hồi',
  DISCONNECTED: 'Đã ngắt kết nối',
  ERROR: 'Lỗi',
};

function groupConnections(
  connections: BankConnection[],
): Array<[string, BankConnection[]]> {
  const groups = new Map<string, BankConnection[]>();
  for (const connection of connections) {
    const group = groups.get(connection.cassoFlowAuthorizationId) ?? [];
    group.push(connection);
    groups.set(connection.cassoFlowAuthorizationId, group);
  }
  return Array.from(groups.entries());
}

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
  const canRevealKey = hasPermission(
    user?.role ?? null,
    Permission.BANK_CONNECTION_REVEAL_KEY,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rotationAuthorizationId, setRotationAuthorizationId] = useState<
    string | null
  >(null);
  const disconnectMutation = useDisconnectConnection();
  const previewRotationMutation = usePreviewCassoFlowAuthorizationRotation();
  const rotateMutation = useRotateCassoFlowAuthorization();
  const groups = groupConnections(connections);

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
        {groups.map(([authorizationId, group]) => (
          <Fragment key={authorizationId}>
            {(canManage || canRevealKey) && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="flex justify-end gap-2 text-right"
                >
                  {canRevealKey && (
                    <RevealApiKeyDialog authorizationId={authorizationId} />
                  )}
                  {canManage && (
                    <Dialog
                      open={rotationAuthorizationId === authorizationId}
                      onOpenChange={(open) =>
                        setRotationAuthorizationId(
                          open ? authorizationId : null,
                        )
                      }
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          Đổi API Key
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Đổi API Key{' '}
                            <span className="text-primary">Casso Flow</span>
                          </DialogTitle>
                          <DialogDescription>
                            Nhập API Key mới để cập nhật quyền truy cập cho các
                            tài khoản trong nhóm này.
                          </DialogDescription>
                        </DialogHeader>
                        <CassoFlowAccountPicker
                          onPreview={(apiKey) =>
                            previewRotationMutation.mutateAsync({
                              authorizationId,
                              apiKey,
                            })
                          }
                          onConfirm={(apiKey) =>
                            rotateMutation.mutateAsync({
                              authorizationId,
                              apiKey,
                            })
                          }
                          onCompleted={() => setRotationAuthorizationId(null)}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </TableCell>
              </TableRow>
            )}
            {group.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell className="max-w-48 break-words font-medium">
                  {connection.bankName}
                </TableCell>
                <TableCell className="max-w-56 break-all">
                  {connection.accountNumber}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      connection.status === 'ACTIVE' ? 'default' : 'outline'
                    }
                  >
                    {statusLabels[connection.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {connection.lastSyncAt
                    ? formatDate(connection.lastSyncAt)
                    : '—'}
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
                                if (pendingId) {
                                  disconnectMutation.mutate(pendingId);
                                }
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
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
