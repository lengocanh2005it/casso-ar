import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatVND } from '@/lib/format';
import type { ReceivableBalanceHistoryListItem } from '../types';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Mở',
  PARTIALLY_PAID: 'Đã thu một phần',
  PAID: 'Đã thu',
  WRITTEN_OFF: 'Xóa nợ',
  CANCELLED: 'Đã hủy',
};

const ACTOR_LABELS: Record<string, string> = {
  USER: 'Người dùng',
  WEBHOOK: 'Webhook',
  SYSTEM: 'Hệ thống',
};

function formatEffectiveTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function DetailRow({ item }: { item: ReceivableBalanceHistoryListItem }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={7}>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Mã tham chiếu</dt>
            <dd className="font-mono text-xs">
              {item.transitionReferenceId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mã người dùng tác động</dt>
            <dd className="font-mono text-xs">{item.actorUserId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lý do</dt>
            <dd>{item.reasonCode ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ghi chú</dt>
            <dd>{item.note ?? '—'}</dd>
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
                <TableCell>{formatEffectiveTime(item.effectiveAt)}</TableCell>
                <TableCell>{item.invoiceNumber ?? '—'}</TableCell>
                <TableCell>{item.customerName ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatVND(item.remainingAmount)}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <span>{item.changeSource}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      •{' '}
                      {item.actorType
                        ? `${ACTOR_LABELS[item.actorType] ?? item.actorType}${
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
                    onClick={() =>
                      setExpandedId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
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
    <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
      Chưa có thay đổi nào trong khoảng thời gian này.
    </div>
  );
}
