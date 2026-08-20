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
import {
  useConfirmCassoFlow,
  usePreviewCassoFlowAccounts,
} from '../api/use-bank-connections';
import { CassoFlowAccountPicker } from './casso-flow-account-picker';

export function ConnectDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const previewMutation = usePreviewCassoFlowAccounts();
  const confirmMutation = useConfirmCassoFlow();

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
          <DialogTitle>
            Kết nối <span className="text-primary">Casso Flow</span>
          </DialogTitle>
          <DialogDescription>
            Nhập API Key từ tài khoản{' '}
            <span className="text-primary">Casso Flow</span> của bạn để đồng bộ
            giao dịch ngân hàng.
          </DialogDescription>
        </DialogHeader>
        <CassoFlowAccountPicker
          onPreview={(apiKey) => previewMutation.mutateAsync({ apiKey })}
          onConfirm={(apiKey, selectedAccountNumbers) =>
            confirmMutation.mutateAsync({ apiKey, selectedAccountNumbers })
          }
          onCompleted={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
