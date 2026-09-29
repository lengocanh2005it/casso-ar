import { Search, Users } from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { CardPagination } from '@/components/shared/card-pagination';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
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
      <div className="relative rounded-xl border bg-card p-3 shadow-sm sm:p-4">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground sm:left-7"
        />
        <Input
          name="search"
          autoComplete="off"
          aria-label="Tìm kiếm khách hàng"
          type="search"
          placeholder="Tìm tên, mã số thuế, số điện thoại…"
          value={search}
          onChange={(event) =>
            setParam('search', event.target.value, {
              resetPage: true,
              replace: true,
            })
          }
          className="w-full pl-9"
        />
      </div>
      <SectionCard className="overflow-hidden">
        {isPending && <TableSkeleton rows={5} />}
        {isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải danh sách khách hàng.
          </p>
        )}
        {data && (
          <CustomerTable customers={data.items} isFiltered={Boolean(search)} />
        )}
        {data && (
          <CardPagination
            page={data.page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        )}
      </SectionCard>
    </div>
  );
}
