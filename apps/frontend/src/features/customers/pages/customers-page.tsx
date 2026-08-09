import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomers } from '../api/use-customers';
import { CustomerTable } from '../components/customer-table';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useCustomers(search, page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">QUẢN LÝ KHÁCH HÀNG</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Khách hàng
        </h1>
      </div>
      <Input
        aria-label="Tìm kiếm khách hàng"
        placeholder="Tìm theo tên, mã số thuế hoặc số điện thoại"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        className="max-w-lg"
      />
      {isPending && <p>Đang tải danh sách khách hàng…</p>}
      {isError && (
        <p className="text-destructive">Không thể tải danh sách khách hàng.</p>
      )}
      {data && <CustomerTable customers={data.items} />}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {data.page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
