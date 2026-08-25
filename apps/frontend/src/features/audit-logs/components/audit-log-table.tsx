import { ScrollText } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
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
import type { OrganizationMember } from '@/features/settings/types';
import { actorLabel } from '@/lib/actor-label';
import { formatDateTime } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { ACTION_TYPE_LABELS, ENTITY_TYPE_LABELS } from '../labels';
import type { AuditLogItem } from '../types';

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
                <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                <TableCell>{actorLabel(item.userId, members)}</TableCell>
                <TableCell>
                  {ACTION_TYPE_LABELS[item.actionType] ?? item.actionType}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span>
                      {ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType}
                    </span>
                    {item.entityId ? (
                      <TruncatedCopyId id={item.entityId} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
