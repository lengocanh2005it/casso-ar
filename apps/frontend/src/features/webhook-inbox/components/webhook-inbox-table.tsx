import { Webhook } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useReprocessWebhook } from '../api/use-webhook-inbox';
import {
  WEBHOOK_INBOX_STATUS_BADGE_VARIANT,
  WEBHOOK_INBOX_STATUS_LABELS,
} from '../labels';
import type { WebhookInboxItem } from '../types';

const RECEIVED_AT_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatReceivedAt(iso: string): string {
  return RECEIVED_AT_FORMATTER.format(new Date(iso));
}

function DetailRow({ item }: { item: WebhookInboxItem }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={6}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Lỗi</dt>
            <dd className="whitespace-pre-wrap break-words">
              {item.errorMessage ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dữ liệu gốc</dt>
            <dd className="whitespace-pre-wrap break-words font-mono text-xs">
              {JSON.stringify(item.rawPayload, null, 2)}
            </dd>
          </div>
        </dl>
      </TableCell>
    </TableRow>
  );
}

interface WebhookInboxTableProps {
  items: WebhookInboxItem[];
}

export function WebhookInboxTable({ items }: WebhookInboxTableProps) {
  const { searchParams, patch } = useUrlQueryParams();
  const expandedId = searchParams.get('expanded');
  const reprocess = useReprocessWebhook();

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
            <TableHead>Thời điểm nhận</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Mã giao dịch</TableHead>
            <TableHead>Số lần thử lại</TableHead>
            <TableHead>
              <span className="sr-only">Chi tiết</span>
            </TableHead>
            <TableHead>
              <span className="sr-only">Hành động</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <TableRow className="align-middle">
                <TableCell>{formatReceivedAt(item.receivedAt)}</TableCell>
                <TableCell>
                  <Badge
                    variant={WEBHOOK_INBOX_STATUS_BADGE_VARIANT[item.status]}
                  >
                    {WEBHOOK_INBOX_STATUS_LABELS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TruncatedCopyId id={item.providerTransactionId} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {item.retryCount}
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
                <TableCell>
                  {item.status === 'FAILED' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reprocess.isPending}
                        >
                          Xử lý lại
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Xử lý lại webhook này?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Hệ thống sẽ thử xử lý lại webhook này với dữ liệu đã
                            nhận. Không xoá dữ liệu hiện có.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => reprocess.mutate(item.id)}
                          >
                            Xác nhận
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
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

export function WebhookInboxEmpty() {
  return (
    <EmptyState
      density="compact"
      icon={Webhook}
      title="Chưa có webhook nào."
      description="Điều chỉnh bộ lọc hoặc chờ webhook mới từ Casso Flow."
    />
  );
}
