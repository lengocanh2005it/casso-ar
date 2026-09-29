import { History } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
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
    <TableRow className="bg-muted/30">
      <TableCell colSpan={7}>
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
        <TableHeader>
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
          {items.map((item) => (
            <Fragment key={item.id}>
              <TableRow className="align-middle">
                <TableCell>{formatDateTime(item.effectiveAt)}</TableCell>
                <TableCell className="max-w-48">
                  <span
                    className="block max-w-48 truncate"
                    title={item.invoiceNumber ?? undefined}
                  >
                    {item.invoiceNumber ?? 'Khoản phải thu'}
                  </span>
                </TableCell>
                <TableCell className="max-w-48">
                  <span
                    className="block max-w-48 truncate"
                    title={item.customerName ?? undefined}
                  >
                    {item.customerName ?? 'Chưa có tên khách hàng'}
                  </span>
                </TableCell>
                <TableCell>
                  <ReceivableStatusBadge status={item.status} />
                </TableCell>
                <TableCell className="tabular-nums font-semibold">
                  {formatVND(item.remainingAmount)}
                </TableCell>
                <TableCell>
                  <div
                    className="min-w-0 max-w-56 truncate text-sm"
                    title={item.actorDisplayName ?? undefined}
                  >
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
                  </div>
                </TableCell>
                <TableCell>
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
          ))}
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
