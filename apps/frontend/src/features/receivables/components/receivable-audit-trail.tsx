import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { useAuditLogs } from '@/features/audit-logs/api/use-audit-logs';
import {
  AuditLogEmpty,
  AuditLogTable,
} from '@/features/audit-logs/components/audit-log-table';
import { useOrganizationMembers } from '@/features/settings/api/use-settings';

const LIMIT = 20;

export function ReceivableAuditTrail({
  receivableId,
}: {
  receivableId: string;
}) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const membersQuery = useOrganizationMembers(user?.organizationId);
  const logsQuery = useAuditLogs({ receivableId, page, limit: LIMIT });

  if (logsQuery.isLoading) return <TableSkeleton rows={5} />;
  if (logsQuery.isError) {
    return (
      <p role="alert" aria-live="polite" className="text-destructive">
        Không thể tải nhật ký kiểm toán.
      </p>
    );
  }

  const items = logsQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const members = membersQuery.data?.items ?? [];

  if (items.length === 0) return <AuditLogEmpty />;

  return (
    <div className="space-y-4">
      <AuditLogTable items={items} members={members} />
      <div className="flex items-center justify-between">
        <p className="tabular-nums text-sm text-muted-foreground">
          Trang {page} / {totalPages} • {total} nhật ký
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
