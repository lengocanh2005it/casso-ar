import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
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

  // One row per event, same shape as the dashboard activity feed; each label
  // opens the receivable the event belongs to.
  return (
    <ul className="divide-y overflow-hidden rounded-lg border border-border/70">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm"
        >
          <Link
            to={`/receivables/${item.receivableId}`}
            className="font-medium pointer-hover:hover:text-primary pointer-hover:hover:underline"
          >
            {formatActivityType(item.activityType)}
          </Link>
          <time
            dateTime={item.createdAt}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {formatDateTime(item.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
