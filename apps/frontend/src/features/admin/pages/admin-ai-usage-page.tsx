import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type AiUsageAggregateItem, getAiUsage } from '../api/admin-api';

export function AdminAiUsagePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AiUsageAggregateItem[]>([]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await getAiUsage(from, to);
    setItems(result.items);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="from">Từ ngày</Label>
          <Input
            id="from"
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
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
          />
        </div>
        <Button type="submit">Xem</Button>
      </form>
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
          {items.map((item) => (
            <TableRow key={`${item.organizationId}-${item.model}`}>
              <TableCell>{item.organizationName}</TableCell>
              <TableCell>{item.model}</TableCell>
              <TableCell className="font-mono tabular-nums">
                {item.requestCount}
              </TableCell>
              <TableCell className="font-mono tabular-nums">
                {item.totalTokens}
              </TableCell>
              <TableCell className="font-mono tabular-nums">
                {item.errorCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
