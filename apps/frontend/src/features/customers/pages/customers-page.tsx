import { Permission } from '@casso-ar/shared-types';
import { Search, Users } from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { CardPagination } from '@/components/shared/card-pagination';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { cn } from '@/lib/utils';
import { useCustomers } from '../api/use-customers';
import { CustomerTable } from '../components/customer-table';

export function CustomersPage() {
  const { user } = useAuth();
  const { searchParams, setParam, setPage } = useUrlQueryParams();
  const search = searchParams.get('search') ?? '';
  const debouncedSearch = useDebouncedValue(search, 250);
  const page = Number(searchParams.get('page') ?? '1');
  const { data, isPending, isError, isPlaceholderData } = useCustomers(
    debouncedSearch,
    page,
  );
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
          <div
            aria-busy={isPlaceholderData}
            className={cn(
              'transition-opacity motion-reduce:transition-none',
              isPlaceholderData && 'opacity-60',
            )}
          >
            <CustomerTable
              customers={data.items}
              isFiltered={Boolean(debouncedSearch)}
              canImport={hasPermission(
                user?.role ?? null,
                Permission.RECEIVABLE_IMPORT,
              )}
            />
          </div>
        )}
        {data && (
          <CardPagination
            page={data.page}
            totalPages={totalPages}
            summary={`${data.total.toLocaleString('vi-VN')} khách hàng`}
            onPageChange={setPage}
          />
        )}
      </SectionCard>
    </div>
  );
}
