import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { formatActivityType } from '@/lib/collection-activity-labels';
import { formatDate } from '@/lib/format';
import { fetchReceivableTimeline } from '../api/receivables-api';

export function ReceivableTimeline({ receivableId }: { receivableId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['receivable-timeline', receivableId],
    queryFn: () => fetchReceivableTimeline(receivableId),
  });

  if (isPending)
    return (
      <p role="status" aria-live="polite">
        Đang tải…
      </p>
    );
  if (isError) {
    return (
      <p role="alert" aria-live="polite" className="text-destructive">
        Không thể tải hoạt động.
      </p>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        density="compact"
        icon={Activity}
        title="Chưa có hoạt động"
        description="Các cập nhật của khoản phải thu sẽ hiển thị tại đây."
      />
    );
  }

  return (
    <ol className="space-y-4">
      {data.items.map((item) => (
        <li key={item.id} className="rounded-lg border p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
            <span className="min-w-0 break-words font-medium">
              {formatActivityType(item.activityType)}
            </span>
            <time className="shrink-0 text-sm text-muted-foreground">
              {formatDate(item.createdAt)}
            </time>
          </div>
          <p className="mt-1 break-words text-sm">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}
