import { CheckCheck, FileSearch, Search, SearchX } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { CardPagination } from '@/components/shared/card-pagination';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatVND } from '@/lib/format';
import { useBulkSelection } from '@/lib/use-bulk-selection';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { cn } from '@/lib/utils';
import { usePendingReview } from '../api/use-exceptions';
import { ExceptionsBulkActionBar } from '../components/exceptions-bulk-action-bar';
import { SplitMatchDialog } from '../components/split-match-dialog';
import type { AiRecommendation, PendingReviewItem } from '../types';

function AiRecommendationBadge({
  recommendation,
}: {
  recommendation: AiRecommendation | null | undefined;
}) {
  if (
    recommendation?.status !== 'SUCCEEDED' ||
    recommendation?.isCurrent !== true
  ) {
    return null;
  }
  const confidenceLabel =
    (recommendation.confidence ?? 0) >= 80 ? 'Cao' : 'Vừa';
  return <Badge variant="secondary">Gợi ý AI · {confidenceLabel}</Badge>;
}

export function ExceptionsPage() {
  const { searchParams, setParam, setPage } = useUrlQueryParams();
  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const debouncedSearch = useDebouncedValue(search, 250);
  const [selected, setSelected] = useState<PendingReviewItem | null>(null);
  const { data, isPending, isError, isPlaceholderData } = usePendingReview(
    page,
    debouncedSearch || undefined,
  );
  const bulkSelection = useBulkSelection(
    (data?.items ?? []).map((item) => item.transaction.id),
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  // An empty placeholder is the previous search's result; its empty state
  // would describe the wrong search, so show the skeleton instead.
  const showsEmptyPlaceholder = isPlaceholderData && data?.items.length === 0;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="CẦN XỬ LÝ"
        title="Hàng chờ xử lý ngoại lệ"
        description="Đối soát các giao dịch ngân hàng chưa khớp với công nợ."
        icon={FileSearch}
        tone="warning"
      />
      <SectionCard
        icon={FileSearch}
        title="Giao dịch cần rà soát"
        description="Tìm kiếm, chọn và xử lý các giao dịch chưa khớp."
      >
        <div className="relative mb-4 sm:max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="search"
            type="search"
            autoComplete="off"
            aria-label="Tìm kiếm giao dịch"
            placeholder="Tìm tên, số tài khoản, nội dung…"
            value={search}
            onChange={(event) =>
              setParam('search', event.target.value, {
                resetPage: true,
                replace: true,
              })
            }
            className="pl-9"
          />
        </div>
        {(isPending || showsEmptyPlaceholder) && <TableSkeleton rows={5} />}
        {isError && (
          <p role="status" aria-live="polite" className="text-destructive">
            Không thể tải danh sách giao dịch cần xử lý. Vui lòng thử lại.
          </p>
        )}
        {/* Worded from the search the data was fetched for (debounced),
            not the box's current text. */}
        {data && data.items.length === 0 && !showsEmptyPlaceholder && (
          <div role="status" aria-live="polite">
            <EmptyState
              icon={debouncedSearch ? SearchX : CheckCheck}
              title={
                debouncedSearch
                  ? 'Không tìm thấy giao dịch phù hợp.'
                  : 'Không có giao dịch cần xử lý.'
              }
              description={
                debouncedSearch
                  ? 'Thử thay đổi từ khóa để xem thêm giao dịch.'
                  : 'Mọi khoản tiền về đã được khớp. Giao dịch cần đối soát sẽ xuất hiện tại đây.'
              }
            />
          </div>
        )}
        {data && data.items.length > 0 && (
          <div
            aria-busy={isPlaceholderData}
            inert={isPlaceholderData}
            className={cn(
              'transition-opacity motion-reduce:transition-none',
              isPlaceholderData && 'opacity-60',
            )}
          >
            <Table>
              <TableHeader className="max-md:hidden">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Chọn tất cả"
                      checked={bulkSelection.allSelected}
                      onCheckedChange={bulkSelection.toggleAll}
                    />
                  </TableHead>
                  <TableHead>Ngày giờ</TableHead>
                  <TableHead>Người chuyển khoản</TableHead>
                  <TableHead>Nội dung chuyển khoản</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Điểm cao nhất</TableHead>
                  <TableHead>
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  // Below md: [☐] payer ........ amount / content / date · score · Xử lý
                  <TableRow
                    key={row.transaction.id}
                    className="max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-1 max-md:py-3"
                  >
                    <TableCell
                      className="max-md:col-start-1 max-md:row-span-3 max-md:row-start-1 max-md:self-start max-md:p-0"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={`Chọn giao dịch ${row.transaction.providerTransactionId}`}
                        checked={bulkSelection.isSelected(row.transaction.id)}
                        onCheckedChange={() =>
                          bulkSelection.toggle(row.transaction.id)
                        }
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums max-md:col-start-2 max-md:row-start-3 max-md:p-0 max-md:text-xs max-md:text-muted-foreground">
                      {formatDateTime(row.transaction.transactionDateTime)}
                    </TableCell>
                    <TableCell className="max-w-64 max-md:col-start-2 max-md:row-start-1 max-md:max-w-none max-md:p-0">
                      <div className="flex min-w-0 items-start gap-2">
                        <InitialsAvatar
                          name={row.transaction.counterpartyName ?? '—'}
                          size="sm"
                          className="max-md:hidden"
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium break-words">
                            {row.transaction.counterpartyName ?? '—'}
                          </p>
                          {row.payer?.accountNumberMasked && (
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {row.payer.accountNumberMasked}
                            </p>
                          )}
                          {(row.payer?.linkedCustomers ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {row.payer.linkedCustomers.map((c) => (
                                <Badge
                                  key={c.customerId}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {c.customerName}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 break-words max-md:col-span-2 max-md:col-start-2 max-md:row-start-2 max-md:max-w-none max-md:p-0 max-md:text-sm">
                      {row.transaction.transferContent?.trim() ? (
                        <span
                          className="line-clamp-2"
                          title={row.transaction.transferContent}
                        >
                          {row.transaction.transferContent}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground">
                          Không có nội dung
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums max-md:col-start-3 max-md:row-start-1 max-md:self-start max-md:p-0">
                      {formatVND(row.transaction.amount)}
                    </TableCell>
                    <TableCell className="max-md:col-start-2 max-md:row-start-3 max-md:justify-self-end max-md:p-0">
                      <div className="flex flex-col items-start gap-1 max-md:flex-row max-md:items-center">
                        {row.topCandidate ? (
                          <Badge variant="outline">
                            {row.topCandidate.totalScore}/100
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground max-md:hidden">
                            —
                          </span>
                        )}
                        <AiRecommendationBadge
                          recommendation={row.aiRecommendation}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right max-md:col-start-3 max-md:row-start-3 max-md:p-0">
                      <Button
                        variant="link"
                        size="sm"
                        className="max-md:h-auto max-md:px-0"
                        onClick={() => setSelected(row)}
                      >
                        Xử lý
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data && (
          <CardPagination
            page={page}
            totalPages={totalPages}
            summary={`${data.total.toLocaleString('vi-VN')} giao dịch`}
            onPageChange={setPage}
          />
        )}
      </SectionCard>
      {data && (
        <ExceptionsBulkActionBar
          items={data.items}
          selectedIds={bulkSelection.selectedIds}
          onResult={(succeeded) => bulkSelection.drop(succeeded)}
        />
      )}{' '}
      {selected && (
        <SplitMatchDialog
          tx={selected.transaction}
          aiRecommendation={selected.aiRecommendation}
          payer={selected.payer}
          open
          onOpenChange={(value) => {
            if (!value) setSelected(null);
          }}
        />
      )}
    </div>
  );
}
