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
        <Button variant="outline">Cancel</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel receivable {receivableId}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Only valid when there are no payments. If there is money, use Write
          off instead.
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
          {mutation.isPending ? 'Processing…' : 'Confirm cancellation'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
