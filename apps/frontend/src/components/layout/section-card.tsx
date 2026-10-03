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
  const hasHeading = Icon || title || description;

  return (
    <Card
      className={cn('animate-fade-up motion-reduce:animate-none', className)}
    >
      {hasHeader && (
        <CardHeader className="flex flex-col items-start gap-3 px-6 min-[521px]:flex-row min-[521px]:items-center">
          {hasHeading && (
            <div
              className="flex min-w-0 flex-col gap-1.5"
              data-slot="card-heading"
            >
              {(Icon || title) && (
                <div className="flex min-w-0 items-center gap-2">
                  {Icon && (
                    <Icon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-primary"
                    />
                  )}
                  {title && <CardTitle className="min-w-0">{title}</CardTitle>}
                </div>
              )}
              {description && (
                <CardDescription className="min-w-0">
                  {description}
                </CardDescription>
              )}
            </div>
          )}
          {action && (
            <CardAction className="min-w-0 w-full max-[520px]:mt-1 min-[521px]:ml-auto min-[521px]:w-auto min-[521px]:self-center">
              {action}
            </CardAction>
          )}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
