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

// Left shadow on the sticky total: when the table is wider than the card the
// bucket columns slide under it, and without an edge nothing says so.
const STICKY_EDGE = 'shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.25)]';

export function CustomerAgingTable({ page }: { page: CustomerAgingPage }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Khách hàng</TableHead>
          {AGING_BUCKET_ORDER.map((bucket) => (
            <TableHead
              key={bucket}
              className="min-w-24 text-right leading-tight whitespace-normal"
            >
              {AGING_BUCKET_LABELS[bucket]}
            </TableHead>
          ))}
          <TableHead
            className={cn(
              'sticky right-0 border-l bg-muted text-right',
              STICKY_EDGE,
            )}
          >
            Tổng còn lại
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.items.map((row) => (
          <TableRow key={row.customerId}>
            <TableCell className="max-w-56">
              <div className="flex min-w-0 items-center gap-2">
                <InitialsAvatar name={row.customerName} size="sm" />
                <div className="min-w-0">
                  <span
                    className="block min-w-0 truncate"
                    title={row.customerName}
                  >
                    {row.customerName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {row.taxCode}
                  </span>
                </div>
              </div>
            </TableCell>
            {AGING_BUCKET_ORDER.map((bucket) => {
              const amount =
                row.buckets.find((item) => item.bucket === bucket)
                  ?.totalRemaining ?? 0;
              return (
                <TableCell
                  key={bucket}
                  className={cn(
                    'text-right whitespace-nowrap tabular-nums',
                    amount === 0
                      ? 'text-muted-foreground/50'
                      : BUCKET_TONE[bucket],
                  )}
                >
                  {formatVND(amount)}
                </TableCell>
              );
            })}
            <TableCell
              className={cn(
                'sticky right-0 border-l bg-card text-right font-semibold whitespace-nowrap tabular-nums',
                STICKY_EDGE,
              )}
            >
              {formatVND(row.totalRemaining)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
