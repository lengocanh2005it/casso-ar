import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useReceivables } from '../api/use-receivables';
import { CreateReceivableDialog } from '../components/create-receivable-dialog';
import { ImportInvoicesDialog } from '../components/import-invoices-dialog';
import { ReceivableFilters } from '../components/receivable-filters';
import { ReceivableTable } from '../components/receivable-table';
import type { ReceivableStatus } from '../types';

export function ReceivablesPage() {
  const [status, setStatus] = useState<ReceivableStatus>();
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useReceivables({ status }, page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">QUẢN LÝ CÔNG NỢ</p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Công nợ
          </h1>
          <div className="flex flex-wrap gap-2">
            <ImportInvoicesDialog />
            <CreateReceivableDialog />
          </div>
        </div>
      </div>
      <ReceivableFilters
        status={status}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      />
      {isPending && <p>Đang tải danh sách công nợ…</p>}
      {isError && (
        <p className="text-destructive">Không thể tải danh sách công nợ.</p>
      )}
      {data && <ReceivableTable receivables={data.items} />}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {data.page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
