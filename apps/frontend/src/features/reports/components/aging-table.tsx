import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatVND } from '@/lib/format';
import type { AgingBucket, AgingReport } from '../types';

const AGING_BUCKETS: AgingBucket[] = [
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_60_PLUS',
];

const percentageFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function AgingTable({
  report,
  totalOutstanding,
}: {
  report: AgingReport;
  totalOutstanding: number;
}) {
  const byBucket = new Map(
    report.buckets.map((bucket) => [bucket.bucket, bucket]),
  );
  const rows = AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: byBucket.get(bucket)?.count ?? 0,
    totalRemaining: byBucket.get(bucket)?.totalRemaining ?? 0,
  }));
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const totalRemaining = rows.reduce((sum, row) => sum + row.totalRemaining, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nhóm tuổi nợ</TableHead>
          <TableHead>Số khoản</TableHead>
          <TableHead>Còn lại</TableHead>
          <TableHead>Tỷ trọng</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.bucket}>
            <TableCell className="font-medium">{row.bucket}</TableCell>
            <TableCell>{row.count}</TableCell>
            <TableCell className="tabular-nums">
              {formatVND(row.totalRemaining)}
            </TableCell>
            <TableCell>
              {totalOutstanding > 0
                ? percentageFormatter.format(
                    row.totalRemaining / totalOutstanding,
                  )
                : percentageFormatter.format(0)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Tổng</TableCell>
          <TableCell>{totalCount}</TableCell>
          <TableCell className="tabular-nums">
            {formatVND(totalRemaining)}
          </TableCell>
          <TableCell>
            {totalOutstanding > 0
              ? percentageFormatter.format(totalRemaining / totalOutstanding)
              : percentageFormatter.format(0)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
