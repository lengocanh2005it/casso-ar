import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  icon?: LucideIcon;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Card + fade-up entrance used across the post-login list pages
 * (Customers, Receivables, Reminders, Exceptions, Settings tabs). Pass
 * `className="[animation-delay:Nms]"` for staggered entrances when a page
 * renders more than one SectionCard.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: SectionCardProps) {
  const hasHeader = Icon || title || description || action;

  return (
    <Card
      className={cn('animate-fade-up motion-reduce:animate-none', className)}
    >
      {hasHeader && (
        <CardHeader className="gap-1.5 @container/card-header grid-rows-[auto_auto] has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="col-span-2 flex min-w-0 items-center gap-2 has-data-[slot=card-action]:col-span-1">
            {Icon && (
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
            )}
            {title && <CardTitle className="min-w-0">{title}</CardTitle>}
          </div>
          {description && (
            <CardDescription className="min-w-0">{description}</CardDescription>
          )}
          {action && (
            <CardAction className="min-w-0 max-[520px]:col-span-2 max-[520px]:col-start-1 max-[520px]:row-start-3 max-[520px]:mt-1 max-[520px]:w-full max-[520px]:justify-self-stretch">
              {action}
            </CardAction>
          )}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
