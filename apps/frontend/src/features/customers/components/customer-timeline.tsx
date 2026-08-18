import type { CustomerTimelineItem } from '@/features/customers/types';
import { formatActivityType } from '@/lib/collection-activity-labels';
import { formatDate } from '@/lib/format';

export function CustomerTimeline({ items }: { items: CustomerTimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <span className="text-muted-foreground">
            {formatDate(item.createdAt)}
          </span>{' '}
          — <span>{formatActivityType(item.activityType)}</span>
        </li>
      ))}
    </ul>
  );
}
