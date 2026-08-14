import { type FormEvent, useState } from 'react';
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
import { type AiUsageAggregateItem, getAiUsage } from '../api/admin-api';

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function AdminAiUsagePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AiUsageAggregateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAiUsage(from, to);
      setItems(result.items);
    } catch {
      setError(
        'Không thể tải dữ liệu usage. Kiểm tra khoảng thời gian và thử lại.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-primary">ADMIN CONSOLE</p>
        <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
          AI usage
        </h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
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
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Spinner className="size-4" />
              Đang tải…
            </>
          ) : (
            'Xem'
          )}
        </Button>
      </form>
      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tổ chức</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="font-mono">Requests</TableHead>
            <TableHead className="font-mono">Tokens</TableHead>
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
                Chưa có dữ liệu usage trong khoảng thời gian đã chọn.
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
  );
}
