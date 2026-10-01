import { SearchX, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/layout/empty-state';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Customer } from '@/features/customers/types';
import { formatDateTime } from '@/lib/format';

export function CustomerTable({
  customers,
  isFiltered = false,
  canImport = false,
}: {
  customers: Customer[];
  isFiltered?: boolean;
  canImport?: boolean;
}) {
  if (customers.length === 0) {
    return isFiltered ? (
      <EmptyState
        icon={SearchX}
        title="Chưa có khách hàng phù hợp"
        description="Thử thay đổi từ khóa hoặc bộ lọc để xem thêm kết quả."
      />
    ) : (
      <EmptyState
        icon={Users}
        title="Chưa có khách hàng nào"
        description="Khách hàng được tạo tự động khi bạn nhập hóa đơn từ file."
        action={
          canImport ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/receivables">Nhập hóa đơn</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader className="max-md:hidden">
        <TableRow>
          <TableHead>Tên khách hàng</TableHead>
          <TableHead>Mã số thuế</TableHead>
          <TableHead>Điều khoản thanh toán</TableHead>
          <TableHead>Ngày tạo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow
            key={customer.id}
            className="max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:px-1 max-md:py-3"
          >
            <TableCell className="max-w-64 break-words max-md:col-span-2 max-md:col-start-1 max-md:row-start-1 max-md:max-w-none max-md:p-0">
              <div className="flex min-w-0 items-center gap-2">
                <InitialsAvatar name={customer.name} size="sm" />
                <Link
                  to={`/customers/${customer.id}`}
                  className="min-w-0 break-words font-medium text-primary pointer-hover:hover:underline"
                >
                  {customer.name}
                </Link>
              </div>
            </TableCell>
            <TableCell className="max-w-48 break-words max-md:col-start-1 max-md:row-start-2 max-md:max-w-none max-md:p-0 max-md:text-xs">
              <span className="mb-0.5 block text-muted-foreground md:hidden">
                Mã số thuế
              </span>
              {customer.taxCode ?? '—'}
            </TableCell>
            <TableCell className="max-md:col-start-2 max-md:row-start-2 max-md:p-0 max-md:text-right max-md:text-xs">
              <span className="mb-0.5 block text-muted-foreground md:hidden">
                Điều khoản thanh toán
              </span>
              <Badge variant="outline">
                {customer.defaultPaymentTermDays} ngày
              </Badge>
            </TableCell>
            <TableCell className="max-md:col-span-2 max-md:col-start-1 max-md:row-start-3 max-md:p-0 max-md:text-xs max-md:text-muted-foreground">
              <span className="mr-1 md:hidden">Ngày tạo:</span>
              {formatDateTime(customer.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
