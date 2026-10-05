import { History } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { TooltipLabel } from '@/components/shared/tooltip-label';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatVND } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import type { ReceivableBalanceHistoryListItem } from '../types';

const ACTOR_LABELS: Record<string, string> = {
  USER: 'Người dùng',
  WEBHOOK: 'Webhook',
  SYSTEM: 'Hệ thống',
};

const CHANGE_SOURCE_LABELS: Record<string, string> = {
  CREATE: 'Tạo mới',
  ALLOCATE: 'Phân bổ',
  UNDO: 'Hoàn tác',
  CANCEL: 'Hủy',
  WRITE_OFF: 'Xóa nợ',
  ROLLOUT_BASELINE: 'Dữ liệu khởi tạo',
};

const REASON_CODE_LABELS: Record<string, string> = {
  RECEIVABLE_CREATED: 'Tạo khoản phải thu',
  PAYMENT_ALLOCATED: 'Phân bổ thanh toán',
  PAYMENT_ALLOCATION_UNDONE: 'Hoàn tác phân bổ thanh toán',
  RECEIVABLE_CANCELLED: 'Hủy khoản phải thu',
  RECEIVABLE_WRITTEN_OFF: 'Xóa nợ khoản phải thu',
  ROLLOUT_BASELINE: 'Dữ liệu khởi tạo',
};

function DetailRow({ item }: { item: ReceivableBalanceHistoryListItem }) {
  return (
    <TableRow className="bg-muted/30 max-md:grid">
      <TableCell colSpan={7} className="max-md:col-span-2">
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Mã tham chiếu</dt>
            <dd>
              {item.transitionReferenceId ? (
                <TruncatedCopyId id={item.transitionReferenceId} />
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lý do</dt>
            <dd>
              {item.reasonCode
                ? (REASON_CODE_LABELS[item.reasonCode] ?? 'Lý do khác')
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ghi chú</dt>
            <dd className="break-words">{item.note ?? '—'}</dd>
          </div>
        </dl>
      </TableCell>
    </TableRow>
  );
}

interface TableProps {
  items: ReceivableBalanceHistoryListItem[];
}

export function ReceivableBalanceHistoryTable({ items }: TableProps) {
  const { searchParams, patch } = useUrlQueryParams();
  const expandedId = searchParams.get('expanded');

  function toggleExpanded(id: string) {
    patch((next) => {
      if (next.get('expanded') === id) {
        next.delete('expanded');
      } else {
        next.set('expanded', id);
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader className="max-md:hidden">
          <TableRow>
            <TableHead>Thời điểm</TableHead>
            <TableHead>Mã hóa đơn</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Số dư còn lại</TableHead>
            <TableHead>Nguồn / Tác nhân</TableHead>
            <TableHead>
              <span className="sr-only">Chi tiết</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const actorLine = `${
              CHANGE_SOURCE_LABELS[item.changeSource] ?? 'Nguồn thay đổi khác'
            } • ${
              item.actorType
                ? `${ACTOR_LABELS[item.actorType] ?? 'Tác nhân khác'}${
                    item.actorDisplayName ? ` (${item.actorDisplayName})` : ''
                  }`
                : 'Không rõ'
            }`;

            return (
              <Fragment key={item.id}>
                {/* Below md: timestamp / balance as an unlabelled title line,
                  then the four secondary fields with breathing room between
                  them. A label on all seven fields stacked into a 309px card
                  with 8px between rows, so each label sat on the value above
                  it — /exceptions and /customers give the title line no label
                  for the same reason. */}
                <TableRow className="align-middle max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-3 max-md:border-b-0 max-md:border-t max-md:px-1 max-md:py-4">
                  <TableCell className="max-md:col-start-1 max-md:row-start-1 max-md:p-0 max-md:text-sm max-md:text-muted-foreground max-md:whitespace-nowrap">
                    {formatDateTime(item.effectiveAt)}
                  </TableCell>
                  <TableCell className="max-w-48 max-md:col-span-2 max-md:col-start-1 max-md:row-start-2 max-md:max-w-none max-md:p-0 max-md:text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                      Mã hóa đơn
                    </span>
                    <TruncatedText
                      className="block max-w-48 truncate max-md:max-w-none max-md:whitespace-normal max-md:break-words"
                      value={item.invoiceNumber}
                    >
                      {item.invoiceNumber ?? 'Khoản phải thu'}
                    </TruncatedText>
                  </TableCell>
                  <TableCell className="max-w-48 max-md:col-span-2 max-md:col-start-1 max-md:row-start-3 max-md:max-w-none max-md:p-0 max-md:text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                      Khách hàng
                    </span>
                    <TruncatedText
                      // `truncate` stops a table cell spilling into the next
                      // column. On a card the cell owns the full width, so the
                      // same class hides whole words ("…Nông nghiệp Đ...") with
                      // no way to read them. Below md there is room to wrap.
                      className="block max-w-48 truncate max-md:max-w-none max-md:whitespace-normal max-md:break-words"
                      value={item.customerName}
                    >
                      {item.customerName ?? 'Chưa có tên khách hàng'}
                    </TruncatedText>
                  </TableCell>
                  <TableCell className="max-md:col-start-1 max-md:row-start-4 max-md:p-0 max-md:text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                      Trạng thái
                    </span>
                    <ReceivableStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="tabular-nums font-semibold max-md:col-start-2 max-md:row-start-1 max-md:p-0 max-md:text-right max-md:text-base">
                    {formatVND(item.remainingAmount)}
                  </TableCell>
                  <TableCell className="max-md:col-span-2 max-md:col-start-1 max-md:row-start-5 max-md:p-0 max-md:text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                      Nguồn / Tác nhân
                    </span>
                    <div className="min-w-0 max-w-56 truncate text-sm max-md:max-w-none max-md:whitespace-normal max-md:break-words">
                      <TooltipLabel label={actorLine}>
                        <span className="block">
                          <span>
                            {CHANGE_SOURCE_LABELS[item.changeSource] ??
                              'Nguồn thay đổi khác'}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            •{' '}
                            {item.actorType
                              ? `${ACTOR_LABELS[item.actorType] ?? 'Tác nhân khác'}${
                                  item.actorDisplayName
                                    ? ` (${item.actorDisplayName})`
                                    : ''
                                }`
                              : 'Không rõ'}
                          </span>
                        </span>
                      </TooltipLabel>
                    </div>
                  </TableCell>
                  <TableCell className="max-md:col-span-2 max-md:col-start-1 max-md:row-start-6 max-md:p-0">
                    {/* No "Chi tiết" label here: the button below already says
                      it, so the label rendered the word twice in a row. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expandedId === item.id}
                      onClick={() => toggleExpanded(item.id)}
                    >
                      Chi tiết
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedId === item.id && <DetailRow item={item} />}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ReceivableBalanceHistoryEmpty() {
  return (
    <EmptyState
      density="compact"
      icon={History}
      title="Chưa có thay đổi nào trong khoảng thời gian này."
      description="Điều chỉnh bộ lọc hoặc chọn khoảng thời gian khác để xem lịch sử."
    />
  );
}
