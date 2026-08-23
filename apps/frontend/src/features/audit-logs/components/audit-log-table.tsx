import { ScrollText } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrganizationMember } from '@/features/settings/types';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { ACTION_TYPE_LABELS, ENTITY_TYPE_LABELS } from '../labels';
import type { AuditLogItem } from '../types';

const CREATED_AT_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatCreatedAt(iso: string): string {
  return CREATED_AT_FORMATTER.format(new Date(iso));
}

export function actorLabel(
  userId: string,
  members: OrganizationMember[],
): string {
  return (
    members.find((member) => member.userId === userId)?.name ??
    'Người dùng đã rời tổ chức'
  );
}

function TruncatedId({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="font-mono text-xs underline decoration-dotted underline-offset-2"
      title={id}
      onClick={() => navigator.clipboard.writeText(id)}
    >
      {id.slice(0, 8)}…
    </button>
  );
}

function DetailRow({ item }: { item: AuditLogItem }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={5}>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Địa chỉ IP</dt>
            <dd>{item.ipAddress ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trước</dt>
            <dd className="whitespace-pre-wrap break-words font-mono text-xs">
              {item.beforeState
                ? JSON.stringify(item.beforeState, null, 2)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sau</dt>
            <dd className="whitespace-pre-wrap break-words font-mono text-xs">
              {item.afterState ? JSON.stringify(item.afterState, null, 2) : '—'}
            </dd>
          </div>
        </dl>
      </TableCell>
    </TableRow>
  );
}

interface AuditLogTableProps {
  items: AuditLogItem[];
  members: OrganizationMember[];
}

export function AuditLogTable({ items, members }: AuditLogTableProps) {
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
            <TableHead>Người thực hiện</TableHead>
            <TableHead>Hành động</TableHead>
            <TableHead>Đối tượng</TableHead>
            <TableHead>
              <span className="sr-only">Chi tiết</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <TableRow className="align-middle">
                <TableCell>{formatCreatedAt(item.createdAt)}</TableCell>
                <TableCell>{actorLabel(item.userId, members)}</TableCell>
                <TableCell>
                  {ACTION_TYPE_LABELS[item.actionType] ?? item.actionType}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span>
                      {ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType}
                    </span>
                    <TruncatedId id={item.entityId} />
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

export function AuditLogEmpty() {
  return (
    <EmptyState
      density="compact"
      icon={ScrollText}
      title="Chưa có nhật ký nào trong khoảng thời gian này."
      description="Điều chỉnh bộ lọc hoặc chọn khoảng thời gian khác để xem nhật ký."
    />
  );
}
