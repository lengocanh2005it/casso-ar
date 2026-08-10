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
import { useWriteOffReceivable } from '../api/use-receivables';

export function WriteOffDialog({ receivableId }: { receivableId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const mutation = useWriteOffReceivable();

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE_OFF)) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Xóa nợ</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa nợ {receivableId}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Chấp nhận mất phần còn lại của khoản phải thu này. Không thể hoàn tác
          thao tác này.
        </DialogDescription>
        {mutation.isError && (
          <p className="text-sm text-destructive">
            Không thể xóa nợ khoản phải thu.
          </p>
        )}
        <Button
          variant="destructive"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(receivableId, { onSuccess: () => setOpen(false) })
          }
        >
          {mutation.isPending ? 'Đang xử lý…' : 'Xác nhận xóa nợ'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
