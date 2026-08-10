import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BankTransaction } from '@/features/transactions/types';
import { formatDate, formatVND } from '@/lib/format';
import { usePendingReview } from '../api/use-exceptions';
import { SplitMatchDialog } from '../components/split-match-dialog';

export function ExceptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const { data, isPending, isError } = usePendingReview(page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">CẦN XỬ LÝ</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Hàng chờ xử lý ngoại lệ
        </h1>
      </div>
      {isPending && <p>Đang tải…</p>}
      {isError && (
        <p className="text-destructive">
          Không thể tải danh sách giao dịch cần xử lý.
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Không có giao dịch cần xử lý.
        </p>
      )}
      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày giờ</TableHead>
              <TableHead>Đối tác</TableHead>
              <TableHead>Số tiền</TableHead>
              <TableHead>Điểm cao nhất</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow
                key={row.transaction.id}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setSelected(row.transaction)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(row.transaction);
                  }
                }}
              >
                <TableCell>
                  {formatDate(row.transaction.transactionDateTime)}
                </TableCell>
                <TableCell>{row.transaction.counterpartyName || '—'}</TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
