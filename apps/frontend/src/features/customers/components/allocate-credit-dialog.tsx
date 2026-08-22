import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAllocationErrorMessage } from '@/features/payments/allocation-errors';
import { getReceivableDisplayName } from '@/features/receivables/receivable-label';
import type { Receivable } from '@/features/receivables/types';
import { formatVND } from '@/lib/format';
import type { CustomerCredits } from '../api/customers-api';
import { useAllocatePayment } from '../api/use-customers';

type CreditPayment = CustomerCredits['items'][number];

export function AllocateCreditDialog({
  payment,
  receivables,
  open,
  onOpenChange,
}: {
  payment: CreditPayment;
  receivables: Receivable[];
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const allocate = useAllocatePayment();
  const [receivableId, setReceivableId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReceivableId('');
      setAmount('');
      setError(null);
    }
  }, [open]);

  const receivable = receivables.find((item) => item.id === receivableId);
  const maxAmount = receivable
    ? Math.min(payment.unallocatedAmount, receivable.remainingAmount)
    : 0;
  const parsedAmount = Number(amount);
  const validAmount =
    Number.isInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= maxAmount;

  function submit() {
    if (!receivable) {
      setError('Vui lòng chọn khoản phải thu cần phân bổ.');
      return;
    }
    if (!validAmount) {
      setError(
        `Số tiền phân bổ không được vượt quá ${formatVND(maxAmount)} và phải là số nguyên dương.`,
      );
      return;
    }

    setError(null);
    allocate.mutate(
      {
        paymentId: payment.paymentId,
        receivableId: receivable.id,
        amount: parsedAmount,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (mutationError) =>
          setError(getAllocationErrorMessage(mutationError)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Phân bổ khoản thanh toán</DialogTitle>
          <DialogDescription>
            {payment.payerName} còn {formatVND(payment.unallocatedAmount)} chưa
            phân bổ.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="block space-y-2 text-sm">
            <span id="receivable-label">Khoản phải thu</span>
            <Select
              value={receivableId}
              onValueChange={(value) => {
                setReceivableId(value);
                setAmount('');
                setError(null);
              }}
            >
              <SelectTrigger aria-label="Khoản phải thu" className="w-full">
                <SelectValue placeholder="Chọn khoản phải thu" />
              </SelectTrigger>
              <SelectContent>
                {receivables
                  .filter((item) => item.remainingAmount > 0)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {getReceivableDisplayName(item.invoiceNumber)} — còn{' '}
                      {formatVND(item.remainingAmount)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <label
            className="block space-y-2 text-sm"
            htmlFor="allocation-amount"
          >
            <span>Số tiền phân bổ</span>
            <Input
              id="allocation-amount"
              aria-label="Số tiền phân bổ"
              type="number"
              min={1}
              max={maxAmount || undefined}
              step={1}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              disabled={!receivable}
            />
            <span className="text-xs text-muted-foreground">
              Tối đa: {formatVND(maxAmount)}
            </span>
          </label>
          {error && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={allocate.isPending}>
            {allocate.isPending ? 'Đang phân bổ…' : 'Phân bổ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
