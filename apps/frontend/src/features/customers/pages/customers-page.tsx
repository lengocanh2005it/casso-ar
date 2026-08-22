import { Search, Users } from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useCustomers } from '../api/use-customers';
import { CustomerTable } from '../components/customer-table';

export function CustomersPage() {
  const { searchParams, setParam, setPage } = useUrlQueryParams();
  const search = searchParams.get('search') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const { data, isPending, isError } = useCustomers(search, page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="QUẢN LÝ KHÁCH HÀNG"
        title="Khách hàng"
        description="Quản lý thông tin và danh sách khách hàng."
        icon={Users}
        tone="info"
      />
      <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Search aria-hidden="true" className="size-4 text-info" />
          <span>Tìm kiếm khách hàng</span>
        </div>
        <Input
          name="search"
          autoComplete="off"
          aria-label="Tìm kiếm khách hàng"
          placeholder="Tìm theo tên, mã số thuế hoặc số điện thoại…"
          value={search}
          onChange={(event) =>
            setParam('search', event.target.value, {
              resetPage: true,
              replace: true,
            })
          }
          className="mt-3 w-full sm:max-w-xl"
        />
      </div>
      <SectionCard className="overflow-hidden">
        {isPending && (
          <p role="status" aria-live="polite">
            Đang tải danh sách khách hàng…
          </p>
        )}
        {isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải danh sách khách hàng.
          </p>
        )}
        {data && <CustomerTable customers={data.items} />}
        {data && data.total > 0 && (
          <div className="-mx-6 mt-4 flex flex-col gap-3 border-t bg-muted/20 px-6 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
      </SectionCard>
    </div>
  );
}
