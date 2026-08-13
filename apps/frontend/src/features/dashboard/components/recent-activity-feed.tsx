import { formatDate } from '@/lib/format';
import type { OrganizationActivityItem } from '../types';

export function RecentActivityFeed({
  items,
}: {
  items: OrganizationActivityItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{item.activityType}</span>
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
