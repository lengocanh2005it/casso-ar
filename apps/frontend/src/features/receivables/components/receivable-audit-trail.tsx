import { useState } from 'react';
import { AuditLogPagination } from '@/components/shared/audit-log-pagination';
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
      <AuditLogPagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPrev={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
    </div>
  );
}
