import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@/lib/format';
import { fetchReceivableTimeline } from '../api/receivables-api';

export function ReceivableTimeline({ receivableId }: { receivableId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['receivable-timeline', receivableId],
    queryFn: () => fetchReceivableTimeline(receivableId),
  });

  if (isPending) return <p>Loading…</p>;
  if (isError) {
    return <p className="text-destructive">Unable to load activity.</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity.</p>;
  }

  return (
    <ol className="space-y-4">
      {data.map((item) => (
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
