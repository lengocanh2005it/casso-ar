import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { usePollConnections } from '../api/use-bank-connections';
import { CasIdConnectionFlow } from './cas-id-connection-flow';

export function ConnectDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  usePollConnections(open);

  if (!hasPermission(user?.role ?? null, Permission.BANK_CONNECTION_MANAGE)) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <CasIdConnectionFlow onCompleted={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
