import { InitialsAvatar } from '@/components/shared/initials-avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AgingBucket, CustomerAgingPage } from '../types';
import {
  AGING_BUCKET_LABELS,
  AGING_BUCKET_ORDER,
} from './customer-aging-filters';

// Overdue buckets get a severity tone so the eye lands on what needs
// attention; NOT_DUE carries no tone since it isn't a problem to flag.
const BUCKET_TONE: Record<AgingBucket, string> = {
  NOT_DUE: '',
  OVERDUE_1_7: 'text-warning-strong',
  OVERDUE_8_30: 'text-warning-strong',
  OVERDUE_31_60: 'text-destructive',
  OVERDUE_60_PLUS: 'text-destructive font-semibold',
};

export function CustomerAgingTable({ page }: { page: CustomerAgingPage }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Khách hàng</TableHead>
          <TableHead>Mã số thuế</TableHead>
          {AGING_BUCKET_ORDER.map((bucket) => (
            <TableHead key={bucket}>{AGING_BUCKET_LABELS[bucket]}</TableHead>
          ))}
          <TableHead className="sticky right-0 border-l bg-muted">
            Tổng còn lại
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.items.map((row) => (
          <TableRow key={row.customerId}>
            <TableCell className="max-w-64">
              <div className="flex min-w-0 items-center gap-2">
                <InitialsAvatar name={row.customerName} size="sm" />
                <span
                  className="block min-w-0 truncate"
                  title={row.customerName}
                >
                  {row.customerName}
                </span>
              </div>
            </TableCell>
            <TableCell className="max-w-48">
              <span className="block truncate" title={row.taxCode}>
                {row.taxCode}
              </span>
            </TableCell>
            {AGING_BUCKET_ORDER.map((bucket) => {
              const amount =
                row.buckets.find((item) => item.bucket === bucket)
                  ?.totalRemaining ?? 0;
              return (
                <TableCell
                  key={bucket}
                  className={cn(
                    'tabular-nums',
                    amount === 0
                      ? 'text-muted-foreground/50'
                      : BUCKET_TONE[bucket],
                  )}
                >
                  {formatVND(amount)}
                </TableCell>
              );
            })}
            <TableCell className="sticky right-0 border-l bg-background font-semibold tabular-nums">
              {formatVND(row.totalRemaining)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
