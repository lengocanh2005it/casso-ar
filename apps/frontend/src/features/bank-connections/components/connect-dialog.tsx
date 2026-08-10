import { Permission } from '@casso-ledger/shared-types';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import {
  useConnectCasId,
  useExchangeCasId,
  usePollConnections,
} from '../api/use-bank-connections';

export function ConnectDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [grantToken, setGrantToken] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState('');
  usePollConnections(open);
  const connectMutation = useConnectCasId();
  const exchangeMutation = useExchangeCasId();

  function reset() {
    setSessionId(null);
    setGrantToken(null);
    setPublicToken('');
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleConnect() {
    connectMutation.mutate(undefined, {
      onSuccess: (result) => {
        setSessionId(result.sessionId);
        setGrantToken(result.grantToken);
      },
      onError: () => toast.error('Không thể tạo liên kết Cas ID.'),
    });
  }

  function handleExchange() {
    if (!sessionId || !publicToken.trim()) return;
    exchangeMutation.mutate(
      { sessionId, publicToken: publicToken.trim() },
      { onSuccess: () => setOpen(false) },
    );
  }

  if (!hasPermission(user?.role ?? null, Permission.BANK_CONNECTION_MANAGE)) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Kết nối ngân hàng</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kết nối qua Cas ID</DialogTitle>
          <DialogDescription>
            Quét mã QR để cấp quyền truy cập tài khoản ngân hàng.
          </DialogDescription>
        </DialogHeader>
        {grantToken ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border p-4">
              <QRCodeSVG value={grantToken} size={200} />
            </div>
            <p className="text-sm text-muted-foreground">
              Sau khi quét, nhập public token do Cas ID trả về.
            </p>
            <Input
              aria-label="Public token"
              placeholder="Public token"
              value={publicToken}
              onChange={(event) => setPublicToken(event.target.value)}
            />
            <Button
              className="w-full"
              onClick={handleExchange}
              disabled={!publicToken.trim() || exchangeMutation.isPending}
            >
              Hoàn tất kết nối
            </Button>
          </div>
        ) : (
          <Button onClick={handleConnect} disabled={connectMutation.isPending}>
            Tạo liên kết kết nối
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
