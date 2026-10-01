import { BarChart3 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
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

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function AdminAiUsagePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [submittedRange, setSubmittedRange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const usageQuery = useAdminAiUsage(
    submittedRange?.from ?? '',
    submittedRange?.to ?? '',
    submittedRange !== null,
  );
  const items = usageQuery.data?.items ?? [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmittedRange({ from, to });
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="PHÂN TÍCH"
        title="Sử dụng AI"
        description="Theo dõi mức sử dụng AI theo tổ chức và khoảng thời gian."
        icon={BarChart3}
        tone="info"
      />
      <form
        aria-label="Lọc mức sử dụng"
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      >
        <div className="space-y-2">
          <Label htmlFor="from">Từ ngày</Label>
          <Input
            id="from"
            name="from"
            autoComplete="off"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
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
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={usageQuery.isFetching}>
          {usageQuery.isFetching ? (
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
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
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
                <TableRow key={`${item.organizationId}-${item.model}`}>
                  <TableCell>
                    <span
                      className="block max-w-[18rem] truncate"
                      title={item.organizationName}
                    >
                      {item.organizationName || 'Không có tên tổ chức'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[14rem] truncate"
                      title={item.model}
                      translate="no"
                    >
                      {item.model || 'Không xác định'}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {numberFormatter.format(item.requestCount)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {numberFormatter.format(item.totalTokens)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
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
