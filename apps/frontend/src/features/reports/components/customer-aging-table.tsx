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
import type { CustomerAgingPage } from '../types';
import {
  AGING_BUCKET_LABELS,
  AGING_BUCKET_ORDER,
} from './customer-aging-filters';

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
          <TableHead>Tổng còn lại</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.items.map((row) => (
          <TableRow key={row.customerId}>
            <TableCell className="max-w-64 break-words">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={row.customerName} size="sm" />
                {row.customerName}
              </div>
            </TableCell>
            <TableCell className="max-w-48 break-words">
              {row.taxCode}
            </TableCell>
            {AGING_BUCKET_ORDER.map((bucket) => (
              <TableCell key={bucket}>
                {formatVND(
                  row.buckets.find((item) => item.bucket === bucket)
                    ?.totalRemaining ?? 0,
                )}
              </TableCell>
            ))}
            <TableCell>{formatVND(row.totalRemaining)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
