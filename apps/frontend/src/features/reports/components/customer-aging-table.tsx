import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { TruncatedName } from '@/components/shared/truncated-text';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { STICKY_EDGE } from '@/lib/chart';
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

// Below md each row becomes a card: customer on the title line, the five
// buckets as a label/value list under it, total on the right of the title.
// Seven money columns measured 902px inside a 293px scroller on a phone, so
// the sideways swipe was the only way to read a customer's aging.
const MOBILE_ROW =
  'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-3 max-md:border-b-0 max-md:border-t max-md:px-1 max-md:py-4';

export function CustomerAgingTable({ page }: { page: CustomerAgingPage }) {
  return (
    <Table>
      <TableHeader className="max-md:hidden">
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
              // Pinning the total keeps it in view while a reviewer scrolls
              // the bucket columns on a desktop. On a phone the seven
              // columns are ~3x the viewport, so the pin lands on top of the
              // bucket amounts instead of beside them — measured at 390px the
              // pinned cell sat at left:213 while the column before it ran to
              // x:822, a 609px overlap. Below md the total scrolls like every
              // other column and the edge shadow comes off with it.
              'sticky right-0 border-l bg-muted text-right max-md:static max-md:shadow-none',
              STICKY_EDGE,
            )}
          >
            Tổng còn lại
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.items.map((row) => (
          <TableRow key={row.customerId} className={MOBILE_ROW}>
            <TableCell className="max-w-56 max-md:col-start-1 max-md:row-start-1 max-md:max-w-none">
              <div className="flex min-w-0 items-center gap-2 max-md:items-start">
                <InitialsAvatar name={row.customerName} size="sm" />
                <div className="min-w-0">
                  <TruncatedName
                    name={row.customerName}
                    className="block max-md:whitespace-normal max-md:break-words"
                  />
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {row.taxCode}
                  </span>
                </div>
              </div>
            </TableCell>
            {AGING_BUCKET_ORDER.map((bucket) => {
              const amount =
                row.buckets.find((item) => item.bucket === bucket)
                  ?.totalRemaining ?? '0';
              return (
                <TableCell
                  key={bucket}
                  className={cn(
                    'text-right whitespace-nowrap tabular-nums max-md:col-span-2 max-md:col-start-1 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:whitespace-normal max-md:break-all',
                    amount === '0'
                      ? 'text-muted-foreground'
                      : BUCKET_TONE[bucket],
                  )}
                >
                  <span className="hidden max-md:block max-md:text-xs max-md:text-muted-foreground">
                    {AGING_BUCKET_LABELS[bucket]}
                  </span>
                  <span className="max-md:break-all">{formatVND(amount)}</span>
                </TableCell>
              );
            })}
            <TableCell
              className={cn(
                // `max-md:shadow-none` matters here even though the column is
                // not pinned below md: STICKY_EDGE paints a grey left-edge
                // smear, and without this it sat beside the total amount as a
                // stray shadow. The header cell already dropped it below md.
                'sticky right-0 border-l bg-card text-right font-semibold whitespace-nowrap tabular-nums max-md:col-start-2 max-md:row-start-1 max-md:min-w-0 max-md:max-w-[45vw] max-md:border-l-0 max-md:bg-transparent max-md:pl-0 max-md:shadow-none max-md:whitespace-normal max-md:break-all',
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
