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
import { CassoFlowConnectForm } from './casso-flow-connect-form';

export function ConnectDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

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
          <DialogTitle>Kết nối Casso Flow</DialogTitle>
          <DialogDescription>
            Nhập API Key từ tài khoản Casso Flow của bạn để đồng bộ giao dịch
            ngân hàng.
          </DialogDescription>
        </DialogHeader>
        <CassoFlowConnectForm onCompleted={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
