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
        <Button>Tạo khoản phải thu</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo khoản phải thu</DialogTitle>
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
            <span className="text-sm">Mã khách hàng</span>
            <Input
              name="customerId"
              autoComplete="off"
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              placeholder="c-123"
            />
          </Label>
          <Label className="block space-y-1">
            <span className="text-sm">Số tiền (đồng)</span>
            <Input
              name="originalAmount"
              autoComplete="off"
              required
              type="number"
              min={1}
              step={1}
              value={originalAmount}
              onChange={(event) => setOriginalAmount(event.target.value)}
            />
          </Label>
          <Label className="block space-y-1">
            <span className="text-sm">Hạn thanh toán</span>
            <Input
              name="dueDate"
              autoComplete="off"
              required
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Label>
          {mutation.isError && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              Không thể tạo khoản phải thu.
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang lưu…' : 'Tạo'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
