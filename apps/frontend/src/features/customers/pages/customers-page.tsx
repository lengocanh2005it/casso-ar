import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomers } from '../api/use-customers';
import { CustomerTable } from '../components/customer-table';

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const { data, isPending, isError } = useCustomers(search, page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

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
          const value = event.target.value;
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (value) {
              next.set('search', value);
            } else {
              next.delete('search');
            }
            next.set('page', '1');
            return next;
          });
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
              onClick={() => setPage(page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
