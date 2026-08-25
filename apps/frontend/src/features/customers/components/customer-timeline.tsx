import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import type { CustomerTimelineItem } from '@/features/customers/types';
import { formatActivityType } from '@/lib/collection-activity-labels';
import { formatDateTime } from '@/lib/format';

export function CustomerTimeline({ items }: { items: CustomerTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        density="compact"
        icon={Activity}
        title="Chưa có hoạt động"
        description="Các cập nhật của khách hàng sẽ hiển thị tại đây."
      />
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm"
        >
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDateTime(item.createdAt)}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            —
          </span>
          <span
            className="min-w-0 truncate"
            title={formatActivityType(item.activityType)}
          >
            {formatActivityType(item.activityType)}
          </span>
        </li>
      ))}
    </ul>
  );
}
