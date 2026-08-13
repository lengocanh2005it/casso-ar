import * as React from 'react';

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-muted motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

// Placeholder that keeps the table's row rhythm stable while data loads,
// instead of collapsing to a text line that shifts the layout.
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải dữ liệu"
      className="space-y-2"
    >
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

export { Skeleton, TableSkeleton };
