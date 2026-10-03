import { Permission } from '@casso-ar/shared-types';
import { Webhook } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { SectionHeading } from '@/components/layout/section-heading';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useWebhookInbox } from '../api/use-webhook-inbox';
import { WEBHOOK_INBOX_STATUSES, type WebhookInboxStatus } from '../types';
import {
  WebhookInboxFiltersBar,
  type WebhookInboxFilterValues,
} from './webhook-inbox-filters';
import { WebhookInboxEmpty, WebhookInboxTable } from './webhook-inbox-table';

const DEFAULT_LIMIT = 20;

function isWebhookInboxStatus(value: string): value is WebhookInboxStatus {
  return (WEBHOOK_INBOX_STATUSES as readonly string[]).includes(value);
}

export function WebhookInboxTab() {
  const { user } = useAuth();
  const canRead = hasPermission(
    user?.role ?? null,
    Permission.WEBHOOK_INBOX_READ,
  );
  const { searchParams, setPage, patch } = useUrlQueryParams();

  const statusParam = searchParams.get('status') ?? 'ALL';
  const providerTransactionId = searchParams.get('search') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const debouncedProviderTransactionId = useDebouncedValue(
    providerTransactionId,
    250,
  );

  const values: WebhookInboxFilterValues = {
    status: isWebhookInboxStatus(statusParam) ? statusParam : 'ALL',
    providerTransactionId,
  };

  const filters = {
    ...(isWebhookInboxStatus(statusParam) ? { status: statusParam } : {}),
    ...(debouncedProviderTransactionId
      ? { providerTransactionId: debouncedProviderTransactionId }
      : {}),
  };

  const inboxQuery = useWebhookInbox({
    ...filters,
    page,
    limit: DEFAULT_LIMIT,
  });

  if (!canRead) return null;

  function updateFilterValues(next: WebhookInboxFilterValues) {
    patch(
      (params) => {
        if (next.status === 'ALL') params.delete('status');
        else params.set('status', next.status);
        if (next.providerTransactionId) {
          params.set('search', next.providerTransactionId);
        } else {
          params.delete('search');
        }
        params.set('page', '1');
      },
      { replace: true },
    );
  }

  const items = inboxQuery.data?.items ?? [];
  const total = inboxQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));

  return (
    <div className="space-y-4">
      <SectionHeading
        icon={Webhook}
        title="Webhook"
        description="Theo dõi giao dịch nhận từ Casso Flow / Casso Balance Hook."
      />
      <WebhookInboxFiltersBar values={values} onChange={updateFilterValues} />
      <SectionCard>
        {inboxQuery.isLoading ? (
          <TableSkeleton rows={5} />
        ) : inboxQuery.isError ? (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải danh sách webhook.
          </p>
        ) : items.length === 0 ? (
          <WebhookInboxEmpty />
        ) : (
          <WebhookInboxTable items={items} />
        )}
      </SectionCard>
      <div className="flex items-center justify-between">
        <p className="tabular-nums text-sm text-muted-foreground">
          Trang {page} / {totalPages} • {total} webhook
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
