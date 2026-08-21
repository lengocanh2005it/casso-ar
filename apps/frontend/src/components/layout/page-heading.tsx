import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeadingProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeadingProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div>
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
