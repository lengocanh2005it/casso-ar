import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { moneyPercent } from '@/lib/chart';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AgingBucket, AgingReport } from '../types';
import { AGING_BUCKET_LABELS } from './customer-aging-filters';

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

// Below md each bucket folds into a card: the bucket name is the title and
// the three numbers sit under it as label/value pairs. Four columns ran
// 89px past a 293px phone scroller, so "Tỷ trọng" had to be swiped into
// view to read the share of a bucket.
const MOBILE_ROW =
  'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-3 max-md:px-1 max-md:py-4';

const MOBILE_CELL = 'max-md:col-span-2 max-md:col-start-1 max-md:p-0';

export function AgingTable({
  report,
  totalOutstanding,
}: {
  report: AgingReport;
  totalOutstanding: string;
}) {
  const byBucket = new Map(
    report.buckets.map((bucket) => [bucket.bucket, bucket]),
  );
  const rows = AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: byBucket.get(bucket)?.count ?? 0,
    totalRemaining: byBucket.get(bucket)?.totalRemaining ?? '0',
  }));
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const totalRemaining = rows.reduce(
    (sum, row) => sum + BigInt(row.totalRemaining),
    0n,
  );
  const outstanding = BigInt(totalOutstanding);

  return (
    <Table>
      <TableHeader className="max-md:hidden">
        <TableRow>
          <TableHead>Nhóm tuổi nợ</TableHead>
          <TableHead>Số khoản</TableHead>
          <TableHead>Còn lại</TableHead>
          <TableHead>Tỷ trọng</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.bucket} className={MOBILE_ROW}>
            <TableCell
              className={cn(MOBILE_CELL, 'max-md:col-start-1 font-medium')}
            >
              {AGING_BUCKET_LABELS[row.bucket]}
            </TableCell>
            <TableCell className="max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0">
              <span className="text-muted-foreground md:hidden">Số khoản</span>
              <span>{row.count}</span>
            </TableCell>
            <TableCell className="max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0">
              <span className="text-muted-foreground md:hidden">Còn lại</span>
              <span className="tabular-nums max-md:break-all">
                {formatVND(row.totalRemaining)}
              </span>
            </TableCell>
            <TableCell className="max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0">
              <span className="text-muted-foreground md:hidden">Tỷ trọng</span>
              <span>
                {outstanding > 0n
                  ? percentageFormatter.format(
                      moneyPercent(row.totalRemaining, outstanding) / 100,
                    )
                  : percentageFormatter.format(0)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className={MOBILE_ROW}>
          <TableCell className={cn(MOBILE_CELL, 'max-md:col-start-1')}>
            Tổng
          </TableCell>
          <TableCell className="max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0">
            <span className="text-muted-foreground md:hidden">Số khoản</span>
            <span>{totalCount}</span>
          </TableCell>
          <TableCell className="max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0">
            <span className="text-muted-foreground md:hidden">Còn lại</span>
            <span className="tabular-nums max-md:break-all">
              {formatVND(totalRemaining)}
            </span>
          </TableCell>
          <TableCell className="max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0">
            <span className="text-muted-foreground md:hidden">Tỷ trọng</span>
            <span>
              {outstanding > 0n
                ? percentageFormatter.format(
                    moneyPercent(totalRemaining.toString(), outstanding) / 100,
                  )
                : percentageFormatter.format(0)}
            </span>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
