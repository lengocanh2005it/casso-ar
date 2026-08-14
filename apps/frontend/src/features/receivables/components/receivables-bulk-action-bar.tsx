import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { BulkConfirmDialog } from '@/components/bulk-confirm-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import type { BatchItemResult } from '@/lib/batch-types';
import { summarizeBatchResults } from '@/lib/batch-types';
import { hasPermission } from '@/lib/rbac';
import {
  useBatchCancelReceivables,
  useBatchWriteOffReceivables,
} from '../api/use-receivables';
import type { Receivable } from '../types';

export function ReceivablesBulkActionBar({
  selectedIds,
  onResult,
}: {
  selectedIds: string[];
  onResult: (succeeded: string[], failed: string[]) => void;
}) {
  const { user } = useAuth();
  const writeOff = useBatchWriteOffReceivables();
  const cancel = useBatchCancelReceivables();
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE_OFF)) {
    return null;
  }
  if (selectedIds.length === 0) return null;

  function report(results: BatchItemResult<Receivable>[]) {
    const { succeeded, failed } = summarizeBatchResults(results);
    if (failed.length === 0) {
      toast.success(
        `Đã xử lý ${succeeded.length}/${results.length} khoản phải thu.`,
      );
    } else {
      toast.error(
        `${succeeded.length}/${results.length} thành công, ${failed.length} lỗi.`,
      );
    }
    onResult(succeeded, failed);
  }

  function reportError() {
    toast.error('Không thể xử lý thao tác hàng loạt. Vui lòng thử lại.');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <span className="text-sm font-medium">Đã chọn {selectedIds.length}</span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setWriteOffOpen(true)}
      >
        Xóa nợ
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
        Hủy
      </Button>

      <BulkConfirmDialog
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
        title={`Xóa nợ ${selectedIds.length} khoản phải thu`}
        description="Chấp nhận mất phần còn lại của các khoản phải thu đã chọn. Không thể hoàn tác thao tác này."
        confirmLabel="Xác nhận xóa nợ"
        confirmVariant="destructive"
        isPending={writeOff.isPending}
        onConfirm={() =>
          writeOff.mutate(selectedIds, {
            onSuccess: (data: { results: BatchItemResult<Receivable>[] }) => {
              report(data.results);
              setWriteOffOpen(false);
            },
            onError: reportError,
          })
        }
      />
      <BulkConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Hủy ${selectedIds.length} khoản phải thu`}
        description="Chỉ áp dụng cho các khoản chưa có thanh toán nào."
        confirmLabel="Xác nhận hủy"
        confirmVariant="destructive"
        isPending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(selectedIds, {
            onSuccess: (data: { results: BatchItemResult<Receivable>[] }) => {
              report(data.results);
              setCancelOpen(false);
            },
            onError: reportError,
          })
        }
      />
    </div>
  );
}
