import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useCreateReceivable } from '../api/use-receivables';

export function CreateReceivableDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const mutation = useCreateReceivable();

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE)) {
    return null;
  }

  function reset() {
    setCustomerId('');
    setOriginalAmount('');
    setDueDate('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Create receivable</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create receivable</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(
              {
                customerId,
                originalAmount: Number(originalAmount),
                dueDate,
              },
              {
                onSuccess: () => {
                  reset();
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Label className="block space-y-1">
            <span className="text-sm">Customer ID</span>
            <Input
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              placeholder="c-123"
            />
          </Label>
          <Label className="block space-y-1">
            <span className="text-sm">Amount (dong)</span>
            <Input
              required
              type="number"
              min={1}
              step={1}
              value={originalAmount}
              onChange={(event) => setOriginalAmount(event.target.value)}
            />
          </Label>
          <Label className="block space-y-1">
            <span className="text-sm">Due date</span>
            <Input
              required
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Label>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              Không thể tạo khoản phải thu.
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
