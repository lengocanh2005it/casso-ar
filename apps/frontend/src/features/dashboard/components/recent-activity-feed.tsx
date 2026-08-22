import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { formatActivityType } from '@/lib/collection-activity-labels';
import { formatDate } from '@/lib/format';
import type { OrganizationActivityItem } from '../types';

export function RecentActivityFeed({
  items,
}: {
  items: OrganizationActivityItem[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        density="compact"
        icon={Activity}
        title="Chưa có hoạt động"
        description="Các cập nhật thu tiền và xử lý công nợ sẽ hiển thị tại đây."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">
              {formatActivityType(item.activityType)}
            </span>
            <time
              dateTime={item.createdAt}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {formatDate(item.createdAt)}
            </time>
          </div>
          <p className="mt-0.5 break-words text-muted-foreground">
            {item.description}
          </p>
        </li>
      ))}
    </ol>
  );
}
