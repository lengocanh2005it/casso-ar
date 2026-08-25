import { Permission, ReceivableStatus } from '@casso-ar/shared-types';
import { Receipt, Search } from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useBulkSelection } from '@/lib/use-bulk-selection';
import { useCsvExport } from '@/lib/use-csv-export';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { exportReceivablesCsv } from '../api/receivables-api';
import { useReceivables } from '../api/use-receivables';
import { CreateReceivableDialog } from '../components/create-receivable-dialog';
import { ImportInvoicesDialog } from '../components/import-invoices-dialog';
import { ReceivableFilters } from '../components/receivable-filters';
import { ReceivableTable } from '../components/receivable-table';
import { ReceivablesBulkActionBar } from '../components/receivables-bulk-action-bar';

export function ReceivablesPage() {
  const { user } = useAuth();
  const { searchParams, setParam, setPage } = useUrlQueryParams();
  const { isExporting, exportCsv } = useCsvExport();
  const status =
    (searchParams.get('status') as ReceivableStatus | null) ?? undefined;
  const customerId = searchParams.get('customerId') ?? undefined;
  const search = searchParams.get('search') ?? '';
  const debouncedSearch = useDebouncedValue(search, 250);
  const page = Number(searchParams.get('page') ?? '1');
  const { data, isPending, isError } = useReceivables(
    { status, customerId, search: debouncedSearch || undefined },
    page,
  );
  const eligibleIds = (data?.items ?? [])
    .filter(
      (receivable) =>
        receivable.status === ReceivableStatus.OPEN ||
        receivable.status === ReceivableStatus.PARTIALLY_PAID,
    )
    .map((receivable) => receivable.id);
  const bulkSelection = useBulkSelection(eligibleIds);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const canExport = hasPermission(
    user?.role ?? null,
    Permission.RECEIVABLE_READ,
  );

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="QUẢN LÝ CÔNG NỢ"
        title="Công nợ"
        description="Theo dõi và quản lý công nợ của khách hàng."
        icon={Receipt}
        tone="brand"
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <Button
                variant="outline"
                disabled={isExporting}
                className="min-w-24"
                onClick={() =>
                  exportCsv(
                    () =>
                      exportReceivablesCsv({
                        status,
                        customerId,
                        search: search || undefined,
                      }),
                    'cong-no.csv',
                  )
                }
              >
                {isExporting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    Đang xuất…
                  </span>
                ) : (
                  'Xuất CSV'
                )}
              </Button>
            )}
            <ImportInvoicesDialog />
            <CreateReceivableDialog />
          </div>
        }
      />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="search"
            type="search"
            autoComplete="off"
            aria-label="Tìm kiếm công nợ"
            placeholder="Tìm theo số hóa đơn hoặc khách hàng…"
            value={search}
            onChange={(event) => {
              setParam('search', event.target.value, {
                resetPage: true,
                replace: true,
              });
            }}
            className="w-full pl-9"
          />
        </div>
        <ReceivableFilters
          status={status}
          onStatusChange={(value) =>
            setParam('status', value ?? '', { resetPage: true })
          }
        />
      </div>
      <SectionCard className="overflow-hidden">
        {isPending && <TableSkeleton rows={5} />}
        {isError && (
          <p role="status" aria-live="polite" className="text-destructive">
            Không thể tải danh sách công nợ. Vui lòng thử lại.
          </p>
        )}
        {data && (
          <ReceivableTable
            receivables={data.items}
            selectedIds={bulkSelection.selectedIds}
            onToggle={bulkSelection.toggle}
            onToggleAll={bulkSelection.toggleAll}
            allSelected={bulkSelection.allSelected}
          />
        )}
        {data && data.total > 0 && (
          <div className="-mx-6 mt-4 flex flex-col gap-3 border-t bg-muted/20 px-6 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Trang {data.page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
      <ReceivablesBulkActionBar
        selectedIds={bulkSelection.selectedIds}
        onResult={(succeeded) => bulkSelection.drop(succeeded)}
      />
    </div>
  );
}
