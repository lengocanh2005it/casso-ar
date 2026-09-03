import { Permission } from '@casso-ar/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { Badge } from '@/components/ui/badge';
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
import { getAllocationErrorMessage } from '@/features/payments/allocation-errors';
import { getReceivableDisplayName } from '@/features/receivables/receivable-label';
import { formatDate, formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  useCandidates,
  useMarkPrepaid,
  useSkipTransaction,
  useSplitMatch,
} from '../api/use-exceptions';
import type { AiRecommendation, BankTransaction } from '../types';

function AiRecommendationNotice({
  recommendation,
}: {
  recommendation: AiRecommendation | null | undefined;
}) {
  if (recommendation?.status === 'SUCCEEDED' && recommendation.isCurrent) {
    const confidenceLabel =
      (recommendation.confidence ?? 0) >= 80 ? 'Cao' : 'Vừa';
    return (
      <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Badge variant="secondary">Gợi ý AI · {confidenceLabel}</Badge>
        {recommendation.reason && (
          <p className="text-sm text-muted-foreground">
            {recommendation.reason}
          </p>
        )}
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">AI không có gợi ý</p>;
}

export function SplitMatchDialog({
  tx,
  aiRecommendation,
  open,
  onOpenChange,
}: {
  tx: BankTransaction;
  aiRecommendation?: AiRecommendation | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: candidates = [] } = useCandidates(open ? tx.id : '');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [prepaidCustomerId, setPrepaidCustomerId] = useState('');
  const [allocationError, setAllocationError] = useState<string | null>(null);
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
      setAllocationError(null);
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

  // The raw provider reference (e.g. "provider-7b2c0530") means nothing to a
  // user — show who the transaction is with when we know it, falling back
  // to the transfer content, and only to the raw id if neither is available.
  const transactionLabel =
    tx.counterpartyName?.trim() ||
    tx.transferContent?.trim() ||
    tx.providerTransactionId;

  function onMatch() {
    if (!valid) {
      setAllocationError(
        `Tổng phân bổ ${formatVND(total)} không được vượt quá số tiền giao dịch ${formatVND(tx.amount)}.`,
      );
      return;
    }
    setAllocationError(null);
    splitMatch.mutate(
      { id: tx.id, allocations, version: tx.version },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) =>
          setAllocationError(getAllocationErrorMessage(error)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="min-w-0 pr-6">
            Xử lý giao dịch{' '}
            <span
              className="inline-block max-w-full truncate align-bottom"
              title={transactionLabel}
            >
              {transactionLabel}
            </span>{' '}
            — {formatVND(tx.amount)}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Xem lại các khoản phải thu gợi ý trước khi phân bổ giao dịch ngân hàng
          này.
        </DialogDescription>
        <div className="space-y-3">
          <AiRecommendationNotice recommendation={aiRecommendation} />
          <div>
            <p className="text-sm font-medium">Nội dung chuyển khoản</p>
            {tx.transferContent?.trim() ? (
              <p className="break-words text-sm text-muted-foreground">
                {tx.transferContent}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Không có nội dung
              </p>
            )}
          </div>
          {sortedCandidates.map((candidate) => {
            const candidateLabel = candidate.customerName
              ? `${getReceivableDisplayName(candidate.invoiceNumber)} — ${candidate.customerName}`
              : getReceivableDisplayName(candidate.invoiceNumber);

            return (
              <div
                key={candidate.receivableId}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="text-sm font-medium tabular-nums">
                  {candidate.totalScore}/100
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={candidateLabel}>
                    {candidateLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Còn lại:{' '}
                    {candidate.remainingAmount === null
                      ? 'Chưa có số dư'
                      : formatVND(candidate.remainingAmount)}{' '}
                    · Hạn thanh toán:{' '}
                    {candidate.dueDate
                      ? formatDate(candidate.dueDate)
                      : 'Chưa có hạn thanh toán'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Mã kỹ thuật: <TruncatedCopyId id={candidate.receivableId} />
                  </p>
                </div>
                <label
                  htmlFor={`allocation-${candidate.receivableId}`}
                  className="flex items-center gap-2 text-sm"
                >
                  Số tiền phân bổ
                  <Input
                    name={`allocation-${candidate.receivableId}`}
                    autoComplete="off"
                    aria-label={`Số tiền phân bổ cho ${getReceivableDisplayName(candidate.invoiceNumber)}`}
                    id={`allocation-${candidate.receivableId}`}
                    type="number"
                    min={0}
                    step={1}
                    className="w-full sm:w-40"
                    value={amounts[candidate.receivableId] ?? ''}
                    onChange={(event) => {
                      setAmounts((current) => ({
                        ...current,
                        [candidate.receivableId]: event.target.value,
                      }));
                      setAllocationError(null);
                    }}
                  />
                </label>
              </div>
            );
          })}
          <p className="text-sm">
            Đã phân bổ: <span className="tabular-nums">{formatVND(total)}</span>{' '}
            / {formatVND(tx.amount)}
          </p>
          {allocationError && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              {allocationError}
            </p>
          )}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
