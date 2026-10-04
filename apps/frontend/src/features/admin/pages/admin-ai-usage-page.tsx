import { BarChart3 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminAiUsage } from '../api/use-admin';
import { last7DayRange } from '../lib/admin-date-range';

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function AdminAiUsagePage() {
  // Land on a real window instead of an empty date form: the operator sees
  // the last 7 days immediately and can still narrow it down.
  const [range, setRange] = useState(last7DayRange);
  const [submittedRange, setSubmittedRange] = useState(range);
  // The first load runs without the operator asking, so the submit button
  // only shows its busy state for a refresh they actually triggered.
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);
  const usageQuery = useAdminAiUsage(submittedRange.from, submittedRange.to);
  const items = usageQuery.data?.items ?? [];
  const isRefreshing = awaitingRefresh && usageQuery.isFetching;

  useEffect(() => {
    if (!usageQuery.isFetching) setAwaitingRefresh(false);
  }, [usageQuery.isFetching]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAwaitingRefresh(true);
    setSubmittedRange(range);
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="PHÂN TÍCH"
        title="Sử dụng AI"
        description="Theo dõi mức sử dụng AI theo tổ chức và khoảng thời gian."
        icon={BarChart3}
        tone="ai"
      />
      <form
        aria-label="Lọc mức sử dụng"
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4"
      >
        <div className="space-y-2">
          <Label htmlFor="from">Từ ngày</Label>
          <Input
            id="from"
            name="from"
            autoComplete="off"
            type="date"
            value={range.from}
            onChange={(event) =>
              setRange((current) => ({
                ...current,
                from: event.target.value,
              }))
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Đến ngày</Label>
          <Input
            id="to"
            name="to"
            autoComplete="off"
            type="date"
            value={range.to}
            onChange={(event) =>
              setRange((current) => ({
                ...current,
                to: event.target.value,
              }))
            }
            required
          />
        </div>
        <Button type="submit" disabled={isRefreshing}>
          {isRefreshing ? (
            <>
              <Spinner className="size-4" />
              Đang tải…
            </>
          ) : (
            'Xem'
          )}
        </Button>
      </form>
      {usageQuery.isError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          Không thể tải dữ liệu sử dụng. Kiểm tra khoảng thời gian và thử lại.
        </p>
      )}
      <div
        data-testid="admin-ai-usage-table"
        className="animate-fade-up overflow-hidden rounded-xl border bg-card shadow-sm motion-reduce:animate-none"
      >
        <Table>
          <TableHeader className="max-md:hidden">
            <TableRow>
              <TableHead>Tổ chức</TableHead>
              <TableHead>Mô hình</TableHead>
              <TableHead className="font-mono">Lượt gọi</TableHead>
              <TableHead className="font-mono">Token</TableHead>
              <TableHead className="font-mono">Lỗi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Chưa có dữ liệu sử dụng trong khoảng thời gian đã chọn.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={`${item.organizationId}-${item.model}`}
                  className="max-md:grid"
                >
                  <TableCell className="max-md:col-span-2 max-md:row-start-1">
                    <span
                      className="block max-w-[18rem] truncate"
                      title={item.organizationName}
                    >
                      {item.organizationName || 'Không có tên tổ chức'}
                    </span>
                    <span
                      className="mt-0.5 block max-w-[14rem] truncate text-xs text-muted-foreground md:hidden"
                      title={item.model}
                      translate="no"
                    >
                      {item.model || 'Không xác định'}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground md:hidden">
                      <span>
                        Lượt gọi: {numberFormatter.format(item.requestCount)}
                      </span>
                      <span>
                        Token: {numberFormatter.format(item.totalTokens)}
                      </span>
                      <span>
                        Lỗi: {numberFormatter.format(item.errorCount)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="max-md:hidden">
                    <span
                      className="block max-w-[14rem] truncate"
                      title={item.model}
                      translate="no"
                    >
                      {item.model || 'Không xác định'}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums max-md:hidden">
                    {numberFormatter.format(item.requestCount)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums max-md:hidden">
                    {numberFormatter.format(item.totalTokens)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums max-md:hidden">
                    {numberFormatter.format(item.errorCount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
