import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { ReceivableStatus } from '@/features/receivables/types';
import { useCsvExport } from '@/lib/use-csv-export';
import { exportReceivableBalanceHistoryCsv } from '../api/receivable-balance-history-api';
import {
  useReceivableBalanceHistory,
  useReceivableBalanceHistorySummary,
} from '../api/use-receivable-balance-history';
import { ReceivableBalanceHistoryCharts } from '../components/receivable-balance-history-charts';
import {
  ReceivableBalanceHistoryFilters,
  type ReceivableBalanceHistoryFilterValues,
} from '../components/receivable-balance-history-filters';
import { ReceivableBalanceHistoryKpis } from '../components/receivable-balance-history-kpis';
import {
  ReceivableBalanceHistoryEmpty,
  ReceivableBalanceHistoryTable,
} from '../components/receivable-balance-history-table';
import type {
  ReceivableBalanceHistoryFilters as Filters,
  ReceivableBalanceHistoryChangeSource,
} from '../types';

const DEFAULT_LIMIT = 20;

function defaultDateWindow(): { from: string; to: string } {
  const now = new Date();
  const to = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const fromDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const from = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fromDate);
  return { from, to };
}

function isValidStatus(value: string | null): value is ReceivableStatus {
  return (
    value !== null &&
    [
      'DRAFT',
      'OPEN',
      'PARTIALLY_PAID',
      'PAID',
      'WRITTEN_OFF',
      'CANCELLED',
    ].includes(value)
  );
}

function isValidChangeSource(
  value: string | null,
): value is ReceivableBalanceHistoryChangeSource {
  return (
    value !== null &&
    [
      'CREATE',
      'ALLOCATE',
      'UNDO',
      'CANCEL',
      'WRITE_OFF',
      'ROLLOUT_BASELINE',
    ].includes(value)
  );
}

export function ReceivableBalanceHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultWindow = useMemo(defaultDateWindow, []);

  const from = searchParams.get('from') ?? defaultWindow.from;
  const to = searchParams.get('to') ?? defaultWindow.to;
  const receivableId = searchParams.get('receivableId') ?? '';
  const status = isValidStatus(searchParams.get('status'))
    ? (searchParams.get('status') as ReceivableStatus)
    : undefined;
  const changeSource = isValidChangeSource(searchParams.get('changeSource'))
    ? (searchParams.get('changeSource') as ReceivableBalanceHistoryChangeSource)
    : undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const filters: Filters = useMemo(
    () => ({
      from,
      to,
      ...(receivableId ? { receivableId } : {}),
      ...(status ? { status } : {}),
      ...(changeSource ? { changeSource } : {}),
    }),
    [from, to, receivableId, status, changeSource],
  );

  const { isExporting, exportCsv } = useCsvExport();
  const listQuery = useReceivableBalanceHistory({
    ...filters,
    page,
    limit: DEFAULT_LIMIT,
  });
  const summaryQuery = useReceivableBalanceHistorySummary(filters);

  useEffect(() => {
    if (!searchParams.get('from') && !searchParams.get('to')) {
      setSearchParams(
        (params) => {
          params.set('from', defaultWindow.from);
          params.set('to', defaultWindow.to);
          return params;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams, defaultWindow]);

  function updateFilterValues(values: ReceivableBalanceHistoryFilterValues) {
    setSearchParams((params) => {
      for (const key of [
        'from',
        'to',
        'receivableId',
        'status',
        'changeSource',
      ]) {
        params.delete(key);
      }
      if (values.from) params.set('from', values.from);
      if (values.to) params.set('to', values.to);
      if (values.receivableId) params.set('receivableId', values.receivableId);
      if (values.status) params.set('status', values.status);
      if (values.changeSource) params.set('changeSource', values.changeSource);
      params.set('page', '1');
      return params;
    });
  }

  async function handleExport() {
    await exportCsv(
      () => exportReceivableBalanceHistoryCsv(filters),
      'receivable-balance-history.csv',
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / DEFAULT_LIMIT),
  );

  if (listQuery.isLoading || summaryQuery.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Lịch sử công nợ</h1>
          <Button disabled>Xuất CSV</Button>
        </div>
        <ReceivableBalanceHistoryKpis summary={undefined} isLoading />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (listQuery.isError || summaryQuery.isError) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Lịch sử công nợ</h1>
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
          Không thể tải dữ liệu lịch sử công nợ. Vui lòng thử lại sau.
        </div>
      </div>
    );
  }

  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Lịch sử công nợ</h1>
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting && <Spinner className="size-4" />}
          Xuất CSV
        </Button>
      </div>

      <ReceivableBalanceHistoryKpis
        summary={summaryQuery.data}
        isLoading={false}
      />
      <ReceivableBalanceHistoryCharts
        dailySeries={summaryQuery.data?.dailySeries ?? []}
        sourceDistribution={summaryQuery.data?.sourceDistribution ?? []}
      />
      <ReceivableBalanceHistoryFilters
        values={{
          from,
          to,
          receivableId,
          status: status ?? '',
          changeSource: changeSource ?? '',
        }}
        onChange={updateFilterValues}
      />

      {items.length === 0 ? (
        <ReceivableBalanceHistoryEmpty />
      ) : (
        <ReceivableBalanceHistoryTable items={items} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Trang {page} / {totalPages} • {listQuery.data?.total ?? 0} thay đổi
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() =>
              setSearchParams((params) => {
                params.set('page', String(Math.max(1, page - 1)));
                return params;
              })
            }
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() =>
              setSearchParams((params) => {
                params.set('page', String(page + 1));
                return params;
              })
            }
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
