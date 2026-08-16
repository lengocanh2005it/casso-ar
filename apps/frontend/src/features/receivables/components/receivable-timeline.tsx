import { useQuery } from '@tanstack/react-query';
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
    return <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>;
  }

  return (
    <ol className="space-y-4">
      {data.items.map((item) => (
        <li key={item.id} className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{item.activityType}</span>
            <time className="text-sm text-muted-foreground">
              {formatDate(item.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-sm">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}
