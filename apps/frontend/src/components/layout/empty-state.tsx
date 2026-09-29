import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  density?: 'compact' | 'default';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  density = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-center',
        density === 'compact' ? 'min-h-28 gap-2 p-4' : 'min-h-40 gap-3 p-6',
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon
          aria-hidden="true"
          data-testid="empty-state-icon"
          className="size-5"
        />
      </div>
      <div className="max-w-md space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
