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
import type { BankTransaction } from '@/features/transactions/types';
import { formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  useCandidates,
  useMarkPrepaid,
  useSkipTransaction,
  useSplitMatch,
} from '../api/use-exceptions';

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
        `Total allocation ${formatVND(total)} exceeds transaction amount ${formatVND(tx.amount)}`,
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Process transaction {tx.providerTransactionId} —{' '}
            {formatVND(tx.amount)}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Review candidate receivables before allocating this bank transaction.
        </DialogDescription>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{tx.transferContent}</p>
          {sortedCandidates.map((candidate) => (
            <div
              key={candidate.receivableId}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <span className="w-16 text-sm font-medium tabular-nums">
                {candidate.totalScore}/100
              </span>
              <span className="flex-1 text-sm">{candidate.receivableId}</span>
              <label
                htmlFor={`allocation-${candidate.receivableId}`}
                className="flex items-center gap-2 text-sm"
              >
                Allocation amount
                <Input
                  aria-label={`Allocation amount for ${candidate.receivableId}`}
                  id={`allocation-${candidate.receivableId}`}
                  type="number"
                  min={0}
                  step={1}
                  className="w-40"
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
            Allocated: <span className="tabular-nums">{formatVND(total)}</span>{' '}
            / {formatVND(tx.amount)}
          </p>
          <label htmlFor="customer-search" className="block text-sm">
            Search customer for credit balance
            <Input
              id="customer-search"
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setPrepaidCustomerId('');
              }}
              placeholder="Customer name, tax code, or phone"
            />
          </label>
          {customerPage && customerPage.items.length > 0 && (
            <Select
              value={prepaidCustomerId}
              onValueChange={setPrepaidCustomerId}
            >
              <SelectTrigger
                aria-label="Customer for credit balance"
                className="w-full"
              >
                <SelectValue placeholder="Select customer" />
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
              Hold (credit balance)
            </Button>
            <Button
              variant="outline"
              disabled={skip.isPending}
              onClick={() =>
                skip.mutate(tx.id, { onSuccess: () => onOpenChange(false) })
              }
            >
              Skip
            </Button>
            <Button onClick={onMatch} disabled={!valid || splitMatch.isPending}>
              Match transaction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
