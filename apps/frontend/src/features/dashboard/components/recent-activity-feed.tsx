import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/layout/empty-state';
import { formatActivityType } from '@/lib/collection-activity-labels';
import { formatDateTime } from '@/lib/format';
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
        className="flex-1"
        icon={Activity}
        title="Chưa có hoạt động"
        description="Các cập nhật thu tiền và xử lý công nợ sẽ hiển thị tại đây."
      />
    );
  }

  return (
    <ol className="divide-y overflow-hidden rounded-lg border border-border/70">
      {items.map((item) => (
        <li key={item.id} className="px-3 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            {/* The stored description reads "… cho khoản phải thu" without
                saying which one, so the title opens that receivable. */}
            <Link
              to={`/receivables/${item.receivableId}`}
              className="font-medium text-primary pointer-hover:hover:underline"
            >
              {formatActivityType(item.activityType)}
            </Link>
            <time
              dateTime={item.createdAt}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {formatDateTime(item.createdAt)}
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
