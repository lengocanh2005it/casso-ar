import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function PendingReviewBanner({
  pendingCount,
}: {
  pendingCount: number;
}) {
  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-accent px-4 py-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 shrink-0 text-primary" />
        <p className="text-sm text-accent-foreground">
          <span className="font-semibold tabular-nums">{pendingCount}</span>{' '}
          giao dịch đang chờ đối soát.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/exceptions">Xử lý ngay</Link>
      </Button>
    </div>
  );
}
