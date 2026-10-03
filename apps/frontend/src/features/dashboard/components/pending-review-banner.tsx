import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function PendingReviewBanner({
  pendingCount,
  loading = false,
}: {
  pendingCount: number;
  loading?: boolean;
}) {
  if (pendingCount === 0 && !loading) return null;

  return (
    <div
      role="status"
      className="animate-banner-in motion-reduce:animate-none flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-accent px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="size-5 shrink-0 text-primary"
        />
        {loading ? (
          <Skeleton aria-hidden="true" className="h-4 w-44 bg-primary/20" />
        ) : (
          <p className="text-sm text-accent-foreground">
            <span className="font-semibold tabular-nums">{pendingCount}</span>{' '}
            giao dịch đang chờ đối soát.
          </p>
        )}
      </div>
      <Button asChild size="sm">
        <Link to="/exceptions">Xử lý ngay</Link>
      </Button>
    </div>
  );
}
