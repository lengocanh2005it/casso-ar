import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Customer } from '@/features/customers/types';
import { formatDate } from '@/lib/format';

export function CustomerTable({ customers }: { customers: Customer[] }) {
  if (customers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có khách hàng phù hợp.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên khách hàng</TableHead>
          <TableHead>Mã số thuế</TableHead>
          <TableHead>Điều khoản thanh toán</TableHead>
          <TableHead>Ngày tạo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            <TableCell>
              <Link
                to={`/customers/${customer.id}`}
                className="font-medium text-primary hover:underline"
              >
                {customer.name}
              </Link>
            </TableCell>
            <TableCell>{customer.taxCode ?? '—'}</TableCell>
            <TableCell>{customer.defaultPaymentTermDays} ngày</TableCell>
            <TableCell>{formatDate(customer.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
