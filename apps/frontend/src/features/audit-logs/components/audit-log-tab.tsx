import { Permission } from '@casso-ar/shared-types';
import { ScrollText } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { AuditLogPagination } from '@/components/shared/audit-log-pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { useOrganizationMembers } from '@/features/settings/api/use-settings';
import { hasPermission } from '@/lib/rbac';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useAuditLogs } from '../api/use-audit-logs';
import {
  AuditLogFiltersBar,
  type AuditLogFilterValues,
  filterValuesToFilters,
} from './audit-log-filters';
import { AuditLogEmpty, AuditLogTable } from './audit-log-table';

const DEFAULT_LIMIT = 20;

export function AuditLogTab() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.role ?? null, Permission.AUDIT_LOG_READ);
  const { searchParams, setPage, patch } = useUrlQueryParams();

  const values: AuditLogFilterValues = {
    actorUserId: searchParams.get('actorUserId') ?? '',
    entityType: searchParams.get('entityType') ?? '',
    actionType: searchParams.get('actionType') ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  };
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const filters = filterValuesToFilters(values);
  const membersQuery = useOrganizationMembers(user?.organizationId);
  const logsQuery = useAuditLogs({ ...filters, page, limit: DEFAULT_LIMIT });

  if (!canRead) return null;

  function updateFilterValues(next: AuditLogFilterValues) {
    patch((params) => {
      for (const key of [
        'actorUserId',
        'entityType',
        'actionType',
        'from',
        'to',
      ]) {
        params.delete(key);
      }
      if (next.actorUserId) params.set('actorUserId', next.actorUserId);
      if (next.entityType) params.set('entityType', next.entityType);
      if (next.actionType) params.set('actionType', next.actionType);
      if (next.from) params.set('from', next.from);
      if (next.to) params.set('to', next.to);
      params.set('page', '1');
    });
  }

  const items = logsQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));
  const members = membersQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AuditLogFiltersBar
        values={values}
        members={members}
        onChange={updateFilterValues}
      />
      <SectionCard
        icon={ScrollText}
        title="Nhật ký"
        description="Lịch sử thao tác trong tổ chức."
      >
        {logsQuery.isLoading ? (
          <TableSkeleton rows={5} />
        ) : logsQuery.isError ? (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải nhật ký.
          </p>
        ) : items.length === 0 ? (
          <AuditLogEmpty />
        ) : (
          <AuditLogTable items={items} members={members} />
        )}
      </SectionCard>
      <AuditLogPagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPrev={() => setPage(Math.max(1, page - 1))}
        onNext={() => setPage(page + 1)}
      />
    </div>
  );
}
