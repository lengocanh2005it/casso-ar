import { useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatVND } from '@/lib/format';
import { useBulkSelection } from '@/lib/use-bulk-selection';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { usePendingReview } from '../api/use-exceptions';
import { ExceptionsBulkActionBar } from '../components/exceptions-bulk-action-bar';
import { SplitMatchDialog } from '../components/split-match-dialog';
import type { BankTransaction } from '../types';

export function ExceptionsPage() {
  const { searchParams, setParam, setPage } = useUrlQueryParams();
  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const debouncedSearch = useDebouncedValue(search, 250);
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const { data, isPending, isError } = usePendingReview(
    page,
    debouncedSearch || undefined,
  );
  const bulkSelection = useBulkSelection(
    (data?.items ?? []).map((item) => item.transaction.id),
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="CẦN XỬ LÝ"
        title="Hàng chờ xử lý ngoại lệ"
        description="Đối soát các giao dịch ngân hàng chưa khớp với công nợ."
      />
      <Input
        name="search"
        type="search"
        autoComplete="off"
        aria-label="Tìm kiếm giao dịch"
        placeholder="Tìm theo tên, số tài khoản hoặc nội dung chuyển khoản…"
        value={search}
        onChange={(event) =>
          setParam('search', event.target.value, {
            resetPage: true,
            replace: true,
          })
        }
        className="max-w-lg"
      />
      {isPending && <TableSkeleton rows={5} />}
      {isError && (
        <p role="status" aria-live="polite" className="text-destructive">
          Không thể tải danh sách giao dịch cần xử lý. Vui lòng thử lại.
        </p>
      )}
      {data && data.items.length === 0 && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          {search
            ? 'Không tìm thấy giao dịch phù hợp.'
            : 'Không có giao dịch cần xử lý.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Chọn tất cả"
                  checked={bulkSelection.allSelected}
                  onCheckedChange={bulkSelection.toggleAll}
                />
              </TableHead>
              <TableHead>Ngày giờ</TableHead>
              <TableHead>Đối tác</TableHead>
              <TableHead>Nội dung chuyển khoản</TableHead>
              <TableHead>Số tiền</TableHead>
              <TableHead>Điểm cao nhất</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.transaction.id}>
                <TableCell
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    aria-label={`Chọn giao dịch ${row.transaction.providerTransactionId}`}
                    checked={bulkSelection.isSelected(row.transaction.id)}
                    onCheckedChange={() =>
                      bulkSelection.toggle(row.transaction.id)
                    }
                  />
                </TableCell>
                <TableCell>
                  {formatDate(row.transaction.transactionDateTime)}
                </TableCell>
                <TableCell className="max-w-64 break-words">
                  {row.transaction.counterpartyName || '—'}
                </TableCell>
                <TableCell className="max-w-64 break-words">
                  {row.transaction.transferContent?.trim() ? (
                    <span
                      className="line-clamp-2"
                      title={row.transaction.transferContent}
                    >
                      {row.transaction.transferContent}
                    </span>
                  ) : (
                    <span className="italic text-muted-foreground">
                      Không có nội dung
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatVND(row.transaction.amount)}
                </TableCell>
                <TableCell>
                  {row.topCandidate ? (
                    <Badge variant="outline">
                      {row.topCandidate.totalScore}/100
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setSelected(row.transaction)}
                  >
                    Xử lý
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {data && (
        <ExceptionsBulkActionBar
          items={data.items}
          selectedIds={bulkSelection.selectedIds}
          onResult={(succeeded) => bulkSelection.drop(succeeded)}
        />
      )}
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
      {selected && (
        <SplitMatchDialog
          tx={selected}
          open
          onOpenChange={(value) => {
            if (!value) setSelected(null);
          }}
        />
      )}
    </div>
  );
}
