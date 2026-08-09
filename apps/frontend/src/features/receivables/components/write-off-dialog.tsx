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
        <Button variant="destructive">Write off</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write off {receivableId}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Accept the loss of the remaining amount. This action cannot be undone.
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
          {mutation.isPending ? 'Processing…' : 'Confirm write-off'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
