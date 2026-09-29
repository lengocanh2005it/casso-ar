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
            <TableCell className="max-w-64 break-words">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={customer.name} size="sm" />
                <Link
                  to={`/customers/${customer.id}`}
                  className="font-medium text-primary pointer-hover:hover:underline"
                >
                  {customer.name}
                </Link>
              </div>
            </TableCell>
            <TableCell className="max-w-48 break-words">
              {customer.taxCode ?? '—'}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {customer.defaultPaymentTermDays} ngày
              </Badge>
            </TableCell>
            <TableCell>{formatDateTime(customer.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
