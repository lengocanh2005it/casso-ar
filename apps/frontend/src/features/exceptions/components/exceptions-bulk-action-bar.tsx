import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { BulkConfirmDialog } from '@/components/bulk-confirm-dialog';
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
import type { BatchItemResult } from '@/lib/batch-types';
import { summarizeBatchResults } from '@/lib/batch-types';
import { formatVND } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  useBatchApproveMatch,
  useBatchMarkPrepaid,
  useBatchSkip,
} from '../api/use-exceptions';
import { BULK_APPROVE_THRESHOLD } from '../constants';
import type { BankTransaction, PendingReviewItem } from '../types';

function reportResults(
  entity: string,
  results: BatchItemResult<unknown>[],
  onResult: (succeeded: string[], failed: string[]) => void,
) {
  const { succeeded, failed } = summarizeBatchResults(results);
  if (failed.length === 0) {
    toast.success(`Đã xử lý ${succeeded.length}/${results.length} ${entity}.`);
  } else {
    toast.error(
      `${succeeded.length}/${results.length} ${entity} thành công, ${failed.length} lỗi.`,
    );
  }
  onResult(succeeded, failed);
}

export function ExceptionsBulkActionBar({
  items,
  selectedIds,
  onResult,
}: {
  items: PendingReviewItem[];
  selectedIds: string[];
  onResult: (succeeded: string[], failed: string[]) => void;
}) {
  const { user } = useAuth();
  const skip = useBatchSkip();
  const markPrepaid = useBatchMarkPrepaid();
  const approveMatch = useBatchApproveMatch();
  const [prepaidOpen, setPrepaidOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const { data: customerPage } = useCustomers(
    customerSearch,
    1,
    prepaidOpen && customerSearch.trim().length > 0,
  );
  const selectedItems = items.filter((item) =>
    selectedIds.includes(item.transaction.id),
  );
  const approvableItems = selectedItems.filter(
    (item) =>
      item.topCandidate &&
      item.topCandidate.totalScore >= BULK_APPROVE_THRESHOLD,
  );
  const approveTotal = approvableItems.reduce(
    (sum, item) => sum + item.transaction.amount,
    0,
  );

  if (!hasPermission(user?.role ?? null, Permission.PAYMENT_ALLOCATE)) {
    return null;
  }
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <span className="text-sm font-medium">Đã chọn {selectedIds.length}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={skip.isPending}
        onClick={() =>
          skip.mutate(selectedIds, {
            onSuccess: (data: {
              results: BatchItemResult<BankTransaction>[];
            }) => reportResults('giao dịch', data.results, onResult),
          })
        }
      >
        Bỏ qua
      </Button>
      <Button variant="outline" size="sm" onClick={() => setPrepaidOpen(true)}>
        Ghi nhận công nợ
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={approvableItems.length === 0}
        onClick={() => setApproveOpen(true)}
      >
        Khớp giao dịch được gợi ý ({approvableItems.length})
      </Button>

      <Dialog open={prepaidOpen} onOpenChange={setPrepaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ghi nhận công nợ hàng loạt cho {selectedIds.length} giao dịch
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Chọn 1 khách hàng áp dụng cho tất cả giao dịch đã chọn.
          </DialogDescription>
          <label
            htmlFor="bulk-prepaid-customer-search"
            className="block text-sm"
          >
            Tìm khách hàng
            <Input
              id="bulk-prepaid-customer-search"
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setCustomerId('');
              }}
              placeholder="Tên khách hàng, mã số thuế hoặc số điện thoại"
            />
          </label>
          {customerPage && customerPage.items.length > 0 && (
            <Select value={customerId} onValueChange={setCustomerId}>
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
              disabled={!customerId || markPrepaid.isPending}
              onClick={() =>
                markPrepaid.mutate(
                  { ids: selectedIds, customerId },
                  {
                    onSuccess: (data: {
                      results: BatchItemResult<unknown>[];
                    }) => {
                      reportResults('giao dịch', data.results, onResult);
                      setPrepaidOpen(false);
                      setCustomerSearch('');
                      setCustomerId('');
                    },
                  },
                )
              }
            >
              {markPrepaid.isPending
                ? 'Đang xử lý…'
                : 'Xác nhận ghi nhận công nợ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <BulkConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Khớp giao dịch được gợi ý cho ${approvableItems.length} giao dịch`}
        description={`Tổng số tiền sẽ được phân bổ: ${formatVND(approveTotal)}. Chỉ áp dụng cho giao dịch có gợi ý khớp với độ tin cậy ≥ ${BULK_APPROVE_THRESHOLD}/100.`}
        confirmLabel="Xác nhận khớp giao dịch"
        isPending={approveMatch.isPending}
        onConfirm={() =>
          approveMatch.mutate(
            approvableItems.map((item) => ({
              bankTransactionId: item.transaction.id,
              allocations: [
                {
                  receivableId: item.topCandidate?.receivableId ?? '',
                  amount: item.transaction.amount,
                },
              ],
              version: item.transaction.version,
            })),
            {
              onSuccess: (data: {
                results: BatchItemResult<BankTransaction>[];
              }) => {
                reportResults('giao dịch', data.results, onResult);
                setApproveOpen(false);
              },
            },
          )
        }
      />
    </div>
  );
}
