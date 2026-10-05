import { Permission } from '@casso-ar/shared-types';
import { Landmark } from 'lucide-react';
import { Fragment, useState } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
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
import { formatDateTime } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  useDisconnectConnection,
  usePreviewCassoFlowAuthorizationRotation,
  useRotateCassoFlowAuthorization,
} from '../api/use-bank-connections';
import type { BankConnection, BankConnectionStatus } from '../types';
import { AuthorizationHistoryDialog } from './authorization-history-dialog';
import { CassoFlowAccountPicker } from './casso-flow-account-picker';
import { ConnectDialog } from './connect-dialog';
import { RevealApiKeyDialog } from './reveal-api-key-dialog';

const statusLabels: Record<BankConnectionStatus, string> = {
  PENDING_AUTHORIZATION: 'Chờ cấp quyền',
  ACTIVE: 'Đang hoạt động',
  REQUIRES_REAUTHORIZATION: 'Cần cấp quyền lại',
  REVOKED: 'Đã thu hồi',
  DISCONNECTED: 'Đã ngắt kết nối',
  ERROR: 'Lỗi',
};

const statusClasses: Record<BankConnectionStatus, string> = {
  PENDING_AUTHORIZATION: 'border-warning/30 bg-warning/15 text-warning-strong',
  ACTIVE: 'border-success/30 bg-success/10 text-success',
  REQUIRES_REAUTHORIZATION:
    'border-warning/30 bg-warning/15 text-warning-strong',
  REVOKED: 'border-destructive/30 bg-destructive/10 text-destructive',
  DISCONNECTED: 'border-border bg-muted text-muted-foreground',
  ERROR: 'border-destructive/30 bg-destructive/10 text-destructive',
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

function AuthorizationActions({
  authorizationId,
  canManage,
  canRevealKey,
}: {
  authorizationId: string;
  canManage: boolean;
  canRevealKey: boolean;
}) {
  const [rotationOpen, setRotationOpen] = useState(false);
  const previewRotationMutation = usePreviewCassoFlowAuthorizationRotation();
  const rotateMutation = useRotateCassoFlowAuthorization();

  return (
    <>
      {canRevealKey && (
        <>
          <AuthorizationHistoryDialog authorizationId={authorizationId} />
          <RevealApiKeyDialog authorizationId={authorizationId} />
        </>
      )}
      {canManage && (
        <Dialog open={rotationOpen} onOpenChange={setRotationOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Đổi API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Đổi API Key <span className="text-primary">Casso Flow</span>
              </DialogTitle>
              <DialogDescription>
                Nhập API Key mới để cập nhật quyền truy cập cho các tài khoản
                trong nhóm này.
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
              onCompleted={() => setRotationOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function ConnectionActions({
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

  if (!connections.length || (!canManage && !canRevealKey)) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {groupConnections(connections).map(([authorizationId]) => (
        <AuthorizationActions
          key={authorizationId}
          authorizationId={authorizationId}
          canManage={canManage}
          canRevealKey={canRevealKey}
        />
      ))}
    </div>
  );
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
  const [pendingId, setPendingId] = useState<string | null>(null);
  const disconnectMutation = useDisconnectConnection();
  const groups = groupConnections(connections);

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Chưa có kết nối ngân hàng"
        description="Kết nối Casso Flow để tự động đồng bộ giao dịch ngân hàng."
        action={<ConnectDialog />}
      />
    );
  }

  return (
    <Table>
      <TableHeader className="max-md:hidden">
        <TableRow>
          <TableHead className="min-w-40">Ngân hàng</TableHead>
          <TableHead className="min-w-44 text-right">Số tài khoản</TableHead>
          <TableHead className="min-w-36">Trạng thái</TableHead>
          <TableHead className="min-w-36 text-right">
            Đồng bộ gần nhất
          </TableHead>
          {canManage && <TableHead className="min-w-32">Thao tác</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map(([authorizationId, group]) => (
          <Fragment key={authorizationId}>
            {group.map((connection) => (
              // Below md: bank name as an unlabelled title, then the three
              // secondary fields with real spacing between them. Labeling
              // every row left each label 2px above the value it described,
              // which read as one dense block.
              <TableRow
                key={connection.id}
                className="max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-3 max-md:border-b-0 max-md:border-t max-md:px-1 max-md:py-4"
              >
                <TableCell className="min-w-40 max-w-56 break-words font-medium max-md:col-span-2 max-md:col-start-1 max-md:row-start-1 max-md:max-w-none max-md:p-0 max-md:text-base">
                  {connection.bankName}
                </TableCell>
                <TableCell className="min-w-44 max-w-56 break-all text-right tabular-nums max-md:col-span-2 max-md:col-start-1 max-md:row-start-2 max-md:max-w-none max-md:p-0 max-md:text-sm max-md:text-right">
                  <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                    Số tài khoản
                  </span>
                  {connection.accountNumber}
                </TableCell>
                <TableCell className="max-md:col-start-1 max-md:row-start-3 max-md:p-0 max-md:text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                    Trạng thái
                  </span>
                  <Badge
                    variant={
                      connection.status === 'ERROR' ? 'destructive' : 'outline'
                    }
                    className={statusClasses[connection.status]}
                  >
                    {statusLabels[connection.status]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums max-md:col-start-2 max-md:row-start-3 max-md:p-0 max-md:text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                    Đồng bộ gần nhất
                  </span>
                  {connection.lastSyncAt
                    ? formatDateTime(connection.lastSyncAt)
                    : '—'}
                </TableCell>
                {canManage && (
                  <TableCell className="min-w-32 max-md:col-span-2 max-md:col-start-1 max-md:row-start-4 max-md:p-0 max-md:text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                      Thao tác
                    </span>
                    {connection.status === 'ACTIVE' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Ngắt kết nối ${connection.bankName} — ${connection.accountNumber}`}
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
