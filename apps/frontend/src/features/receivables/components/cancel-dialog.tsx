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
import { useCancelReceivable } from '../api/use-receivables';

export function CancelDialog({ receivableId }: { receivableId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const mutation = useCancelReceivable();

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE_OFF)) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Hủy</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy khoản phải thu {receivableId}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Chỉ áp dụng khi chưa có khoản thanh toán nào. Nếu đã có tiền, hãy dùng
          chức năng Xóa nợ thay thế.
        </DialogDescription>
        {mutation.isError && (
          <p className="text-sm text-destructive">
            Không thể hủy khoản phải thu.
          </p>
        )}
        <Button
          variant="destructive"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(receivableId, { onSuccess: () => setOpen(false) })
          }
        >
          {mutation.isPending ? 'Đang xử lý…' : 'Xác nhận hủy'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
