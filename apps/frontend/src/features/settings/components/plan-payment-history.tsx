import {
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { ArrowLeftRight, History, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '@/components/layout/section-card';
import { CardPagination } from '@/components/shared/card-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PLAN_LABELS } from '@/features/plans/plans-data';
import { usePlanPaymentHistory } from '@/features/settings/api/use-settings';
import { formatDateTime, formatVND } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';

const PAGE_LIMIT = 20;
const CHECKOUT_REFRESH_INTERVAL_MS = 5_000;
const CHECKOUT_WAIT_LIMIT_MS = 60_000;

const PAYMENT_KIND_LABELS: Record<PlanPaymentHistorySourceType, string> = {
  [PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER]: 'Nâng cấp gói',
  [PlanPaymentHistorySourceType.PERIOD_CHARGE]: 'Gia hạn gói',
};

const PAYMENT_OUTCOME_LABELS: Record<PlanPaymentReceiptOutcome, string> = {
  [PlanPaymentReceiptOutcome.ACCEPTED]: 'Đã xác nhận',
  [PlanPaymentReceiptOutcome.REVIEW_REQUIRED]: 'Cần đối soát',
};

export function PlanPaymentHistory({
  checkoutUrl,
  checkoutOrderCode,
}: {
  checkoutUrl?: string | null;
  checkoutOrderCode?: string | null;
}) {
  const { searchParams, setPage, patch } = useUrlQueryParams();
  const rawPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const historyQuery = usePlanPaymentHistory({ page, limit: PAGE_LIMIT });
  const items = historyQuery.data?.items ?? [];
  const total = historyQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const isPageOutOfRange = page > totalPages;
  const returnOrderCode = searchParams.get('orderCode');
  const checkoutOpen = Boolean(checkoutUrl);
  const checkoutSessionKey = checkoutUrl
    ? `checkout:${checkoutUrl}`
    : returnOrderCode
      ? `return:${returnOrderCode}`
      : null;
  const isCancelledReturn =
    searchParams.get('cancel') === 'true' ||
    searchParams.get('status')?.toUpperCase() === 'CANCELLED';
  const shouldMonitorCheckout =
    checkoutOpen || (Boolean(returnOrderCode) && !isCancelledReturn);
  const trackedOrderCode = checkoutOpen ? checkoutOrderCode : returnOrderCode;
  const shouldCheckTrackedOrder =
    Boolean(trackedOrderCode) && !isCancelledReturn;
  const hasTrackedOrderOnVisiblePage =
    Boolean(trackedOrderCode) &&
    items.some((item) => item.orderCode === trackedOrderCode);
  const shouldLoadFirstPageForTrackedOrder =
    shouldCheckTrackedOrder && page !== 1 && !hasTrackedOrderOnVisiblePage;
  const returnedOrderQuery = usePlanPaymentHistory(
    { page: 1, limit: PAGE_LIMIT },
    shouldLoadFirstPageForTrackedOrder,
  );
  const hasTrackedOrderReceipt =
    hasTrackedOrderOnVisiblePage ||
    (shouldLoadFirstPageForTrackedOrder &&
      (returnedOrderQuery.data?.items.some(
        (item) => item.orderCode === trackedOrderCode,
      ) ??
        false));
  const [expiredCheckoutSession, setExpiredCheckoutSession] = useState<
    string | null
  >(null);
  const checkoutWaitExpired =
    checkoutSessionKey !== null &&
    expiredCheckoutSession === checkoutSessionKey;
  const hasCheckoutReceipt = hasTrackedOrderReceipt;
  const isRefreshingHistory =
    historyQuery.isFetching ||
    (shouldLoadFirstPageForTrackedOrder && returnedOrderQuery.isFetching);
  const shouldClearPayosReturn =
    isCancelledReturn ||
    (Boolean(returnOrderCode) && (checkoutOpen || hasTrackedOrderReceipt));
  const refetchHistory = useCallback(() => {
    void historyQuery.refetch();
    if (shouldLoadFirstPageForTrackedOrder) void returnedOrderQuery.refetch();
  }, [
    historyQuery.refetch,
    returnedOrderQuery.refetch,
    shouldLoadFirstPageForTrackedOrder,
  ]);

  useEffect(() => {
    if (historyQuery.data && isPageOutOfRange) setPage(totalPages);
  }, [historyQuery.data, isPageOutOfRange, setPage, totalPages]);

  useEffect(() => {
    if (!shouldClearPayosReturn) return;
    patch(
      (params) => {
        for (const key of ['code', 'status', 'cancel', 'orderCode']) {
          params.delete(key);
        }
      },
      { replace: true },
    );
  }, [patch, shouldClearPayosReturn]);

  useEffect(() => {
    if (!shouldMonitorCheckout || hasCheckoutReceipt || checkoutWaitExpired)
      return;

    const timeoutId = window.setTimeout(
      () => setExpiredCheckoutSession(checkoutSessionKey),
      CHECKOUT_WAIT_LIMIT_MS,
    );
    const intervalId = window.setInterval(
      refetchHistory,
      CHECKOUT_REFRESH_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [
    checkoutWaitExpired,
    checkoutSessionKey,
    hasCheckoutReceipt,
    refetchHistory,
    shouldMonitorCheckout,
  ]);

  return (
    <SectionCard
      icon={History}
      title="Lịch sử thanh toán gói"
      description="Các khoản thanh toán gói đã được ghi nhận cho tổ chức."
    >
      {historyQuery.isLoading && (
        <p role="status">Đang tải lịch sử thanh toán</p>
      )}

      {historyQuery.isError && (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p>Không thể tải lịch sử thanh toán. Vui lòng thử lại.</p>
          <Button
            type="button"
            variant="outline"
            disabled={isRefreshingHistory}
            onClick={refetchHistory}
          >
            <RefreshCw aria-hidden="true" />
            {isRefreshingHistory ? 'Đang thử lại…' : 'Thử lại'}
          </Button>
        </div>
      )}

      {shouldMonitorCheckout && checkoutWaitExpired && !hasCheckoutReceipt && (
        <div
          className="mb-4 flex flex-col items-start gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p>Chưa nhận được xác nhận thanh toán</p>
          <Button
            type="button"
            variant="outline"
            disabled={isRefreshingHistory}
            onClick={refetchHistory}
          >
            <RefreshCw aria-hidden="true" />
            {isRefreshingHistory ? 'Đang làm mới…' : 'Làm mới'}
          </Button>
        </div>
      )}

      {!historyQuery.isLoading && !historyQuery.isError && total === 0 && (
        <p role="status">Chưa có lịch sử thanh toán.</p>
      )}

      {!historyQuery.isLoading &&
        !historyQuery.isError &&
        items.length === 0 &&
        total > 0 &&
        !isPageOutOfRange && (
          <>
            <p role="status">Không có khoản thanh toán ở trang này.</p>
            <CardPagination
              page={page}
              totalPages={totalPages}
              summary={`${total} khoản thanh toán`}
              onPageChange={setPage}
            />
          </>
        )}

      {!historyQuery.isLoading && !historyQuery.isError && items.length > 0 && (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground xl:hidden">
            <ArrowLeftRight aria-hidden="true" className="size-3.5 shrink-0" />
            Nếu bảng rộng hơn màn hình, vuốt ngang để xem các cột còn lại
          </p>
          <Table className="[&_td]:px-1 [&_th]:px-1 xl:[&_td]:px-2 xl:[&_th]:px-2">
            <TableCaption className="sr-only">
              Lịch sử thanh toán gói của tổ chức
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian xác nhận</TableHead>
                <TableHead>Gói</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Kết quả xác nhận ban đầu</TableHead>
                <TableHead>Mã đơn PayOS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={`${item.orderCode}-${item.confirmedAt}-${item.paymentKind}-${item.initialOutcome}-${item.receivedAmount ?? 'unknown'}-${item.planId}`}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(item.confirmedAt)}
                  </TableCell>
                  <TableCell>{PLAN_LABELS[item.planId]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.receivedAmount === null
                      ? 'Không có dữ liệu'
                      : formatVND(item.receivedAmount)}
                  </TableCell>
                  <TableCell>{PAYMENT_KIND_LABELS[item.paymentKind]}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        item.initialOutcome ===
                        PlanPaymentReceiptOutcome.REVIEW_REQUIRED
                          ? 'border-warning/30 bg-warning/15 text-warning-strong'
                          : undefined
                      }
                    >
                      {PAYMENT_OUTCOME_LABELS[item.initialOutcome]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {item.orderCode}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CardPagination
            page={page}
            totalPages={totalPages}
            summary={`${total} khoản thanh toán`}
            onPageChange={setPage}
          />
        </>
      )}
    </SectionCard>
  );
}
