import { Permission } from '@casso-ledger/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useAuth } from '@/contexts/auth-context';
import { useCustomers } from '@/features/customers/api/use-customers';
import { formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  useCandidates,
  useMarkPrepaid,
  useSkipTransaction,
  useSplitMatch,
} from '../api/use-exceptions';
import type { BankTransaction } from '../types';

export function SplitMatchDialog({
  tx,
  open,
  onOpenChange,
}: {
  tx: BankTransaction;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: candidates = [] } = useCandidates(open ? tx.id : '');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [prepaidCustomerId, setPrepaidCustomerId] = useState('');
  const { data: customerPage } = useCustomers(
    customerSearch,
    1,
    open && customerSearch.trim().length > 0,
  );
  const splitMatch = useSplitMatch();
  const skip = useSkipTransaction();
  const prepaid = useMarkPrepaid();

  useEffect(() => {
    if (open) {
      setAmounts({});
      setCustomerSearch('');
      setPrepaidCustomerId('');
    }
  }, [open]);

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => b.totalScore - a.totalScore),
    [candidates],
  );
  const total = useMemo(
    () =>
      Object.values(amounts).reduce(
        (sum, value) => sum + Math.max(Number(value) || 0, 0),
        0,
      ),
    [amounts],
  );
  const allocations = sortedCandidates
    .filter((candidate) => Number(amounts[candidate.receivableId]) > 0)
    .map((candidate) => ({
      receivableId: candidate.receivableId,
      amount: Number(amounts[candidate.receivableId]),
    }));
  const amountsAreIntegers = allocations.every((allocation) =>
    Number.isInteger(allocation.amount),
  );
  const valid =
    total > 0 && total <= tx.amount && amountsAreIntegers && tx.amount > 0;

  if (!hasPermission(user?.role ?? null, Permission.PAYMENT_ALLOCATE)) {
    return null;
  }

  function onMatch() {
    if (!valid) {
      toast.error(
        `Tổng phân bổ ${formatVND(total)} vượt quá số tiền giao dịch ${formatVND(tx.amount)}`,
      );
      return;
    }
    splitMatch.mutate(
      { id: tx.id, allocations, version: tx.version },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Xử lý giao dịch {tx.providerTransactionId} — {formatVND(tx.amount)}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Xem lại các khoản phải thu gợi ý trước khi phân bổ giao dịch ngân hàng
          này.
        </DialogDescription>
        <div className="space-y-3">
          <p className="break-words text-xs text-muted-foreground">
            {tx.transferContent}
          </p>
          {sortedCandidates.map((candidate) => (
            <div
              key={candidate.receivableId}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="text-sm font-medium tabular-nums">
                {candidate.totalScore}/100
              </span>
              <span className="flex-1 text-sm">{candidate.receivableId}</span>
              <label
                htmlFor={`allocation-${candidate.receivableId}`}
                className="flex items-center gap-2 text-sm"
              >
                Số tiền phân bổ
                <Input
                  name={`allocation-${candidate.receivableId}`}
                  autoComplete="off"
                  aria-label={`Số tiền phân bổ cho ${candidate.receivableId}`}
                  id={`allocation-${candidate.receivableId}`}
                  type="number"
                  min={0}
                  step={1}
                  className="w-full sm:w-40"
                  value={amounts[candidate.receivableId] ?? ''}
                  onChange={(event) =>
                    setAmounts((current) => ({
                      ...current,
                      [candidate.receivableId]: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          ))}
          <p className="text-sm">
            Đã phân bổ: <span className="tabular-nums">{formatVND(total)}</span>{' '}
            / {formatVND(tx.amount)}
          </p>
          <label htmlFor="customer-search" className="block text-sm">
            Tìm khách hàng để ghi nhận công nợ
            <Input
              name="customerSearch"
              autoComplete="off"
              id="customer-search"
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setPrepaidCustomerId('');
              }}
              placeholder="Tên khách hàng, mã số thuế hoặc số điện thoại…"
            />
          </label>
          {customerPage && customerPage.items.length > 0 && (
            <Select
              value={prepaidCustomerId}
              onValueChange={setPrepaidCustomerId}
            >
              <SelectTrigger
                aria-label="Khách hàng để ghi nhận công nợ"
                className="w-full"
              >
                <SelectValue placeholder="Chọn khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {customerPage.items.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={!prepaidCustomerId || prepaid.isPending}
              onClick={() =>
                prepaid.mutate(
                  { id: tx.id, customerId: prepaidCustomerId },
                  { onSuccess: () => onOpenChange(false) },
                )
              }
            >
              Ghi nhận công nợ
            </Button>
            <Button
              variant="outline"
              disabled={skip.isPending}
              onClick={() =>
                skip.mutate(tx.id, { onSuccess: () => onOpenChange(false) })
              }
            >
              Bỏ qua
            </Button>
            <Button onClick={onMatch} disabled={!valid || splitMatch.isPending}>
              Khớp giao dịch
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
